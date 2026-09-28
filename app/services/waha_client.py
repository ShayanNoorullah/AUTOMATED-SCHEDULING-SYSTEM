"""WAHA (WhatsApp HTTP API) client."""
import base64
import contextvars
from contextlib import contextmanager

import requests

from app.services.users import get_system_setting

# WAHA Core (free Docker image) only supports one session named "default" per container.
# Per-user isolation uses separate free containers (see waha_slots.py) — no Plus license.
CORE_SESSION = "default"
_CONNECTED = frozenset({"WORKING", "CONNECTED", "OPEN", "AUTHENTICATED"})
_user_ctx = contextvars.ContextVar("waha_user_id", default=None)
_assign_ctx = contextvars.ContextVar("waha_assign_slot", default=False)


class WahaError(Exception):
    pass


@contextmanager
def use_waha_user(user_id, assign=False):
    """Bind WAHA calls to a specific SSIES account's container slot."""
    t_user = _user_ctx.set(user_id)
    t_assign = _assign_ctx.set(bool(assign))
    try:
        yield
    finally:
        _user_ctx.reset(t_user)
        _assign_ctx.reset(t_assign)


def _resolve_user_id(explicit=None):
    if explicit is not None:
        return explicit
    uid = _user_ctx.get()
    if uid is not None:
        return uid
    try:
        from flask import g
        return getattr(g, "user_id", None)
    except RuntimeError:
        return None


def _is_core_only_error(msg):
    return "only 'default' session" in (msg or "").lower()


def _is_transient_webjs_error(msg):
    m = (msg or "").strip().lower()
    if not m:
        return False
    # WAHA WEBJS can throw opaque "r" evaluate errors intermittently.
    return (
        m == "r"
        or "execution context" in m
        or "protocol error" in m
        or "target closed" in m
        or "evaluate" in m
    )


def _session_name(name=None):
    # Isolation is per container slot; Core session name is always "default".
    return CORE_SESSION


def _cfg(name=None, user_id=None, assign_slot=None):
    uid = _resolve_user_id(user_id)
    assign = _assign_ctx.get() if assign_slot is None else bool(assign_slot)
    key = get_system_setting("waha_api_key", "") or ""
    from app.services.waha_slots import primary_waha_base_url, slot_base_url

    base = primary_waha_base_url()
    slot = None
    if uid is not None:
        from app.services.waha_slots import ensure_user_slot, get_user_slot

        slot = get_user_slot(uid)
        if slot is None and assign:
            try:
                slot = ensure_user_slot(uid)
            except (RuntimeError, ValueError) as e:
                raise WahaError(str(e)) from e
        if slot is None:
            raise WahaError(
                "WhatsApp not linked for this account yet — open Automated Send and scan QR"
            )
        base = slot_base_url(int(slot))
    return {
        "base": base,
        "key": key,
        "session": CORE_SESSION,
        "slot": slot,
        "user_id": uid,
    }


def _headers(key):
    h = {"Content-Type": "application/json"}
    if key:
        h["X-Api-Key"] = key
    return h


def _parse_error(body, status_code):
    text = (body or "").strip()
    if not text:
        return f"HTTP {status_code}"
    try:
        data = __import__("json").loads(text)
        return data.get("message") or data.get("error") or text[:200]
    except ValueError:
        return text[:200]


def _req(method, path, session_name=None, **kwargs):
    cfg = _cfg(session_name)
    if not cfg["base"]:
        raise WahaError("WAHA base URL not configured")
    if not cfg["key"]:
        raise WahaError(
            "WAHA API key not configured — set the same key as WAHA_API_KEY in Superadmin → Settings → WhatsApp / WAHA"
        )
    url = f"{cfg['base']}{path}"
    kwargs.setdefault("headers", _headers(cfg["key"]))
    kwargs.setdefault("timeout", 30)
    try:
        r = requests.request(method, url, **kwargs)
    except requests.RequestException as e:
        err = str(e)
        if "Failed to resolve" in err or "getaddrinfo" in err or "NameResolution" in err:
            raise WahaError(
                f"Cannot reach WAHA at {cfg['base']}. "
                "Outside Docker use http://127.0.0.1:3000 and start the local WAHA container."
            ) from e
        if "Connection refused" in err or "Max retries exceeded" in err:
            raise WahaError(
                f"WAHA is not running at {cfg['base']}. "
                "Start it with: cd docker && docker compose -f waha-compose.yml up -d"
            ) from e
        raise WahaError(err) from e
    if r.status_code == 401:
        raise WahaError("WAHA unauthorized — API key does not match WAHA_API_KEY in Docker")
    if r.status_code >= 400:
        msg = _parse_error(r.text, r.status_code)
        raise WahaError(msg)
    if r.content:
        try:
            return r.json()
        except ValueError:
            return {"raw": r.text}
    return {}


def health():
    """Probe the primary WAHA container (system settings URL) — not a user slot."""
    from app.services.waha_slots import primary_waha_base_url

    base = primary_waha_base_url()
    key = get_system_setting("waha_api_key", "") or ""
    if not base:
        return {"ok": False, "error": "WAHA base URL not configured"}
    if not key:
        return {"ok": False, "error": "WAHA API key not configured"}
    try:
        r = requests.get(f"{base}/api/sessions", headers=_headers(key), timeout=15)
        if r.status_code == 401:
            return {"ok": False, "error": "WAHA unauthorized — API key mismatch"}
        if r.status_code >= 400:
            return {"ok": False, "error": _parse_error(r.text, r.status_code)}
        return {"ok": True, "session": CORE_SESSION, "base": base}
    except requests.RequestException as e:
        hint = ""
        if "waha" in str(e).lower() or "getaddrinfo" in str(e).lower() or "NameResolution" in str(e):
            hint = " — start WAHA locally (docker compose in /docker) or set base URL to http://localhost:3000"
        return {"ok": False, "error": f"{e}{hint}"}


def restart_session(name=None):
    name = _session_name(name)
    try:
        _req("POST", f"/api/sessions/{name}/restart", session_name=name)
    except WahaError:
        try:
            _req("POST", f"/api/sessions/{name}/stop", session_name=name)
        except WahaError:
            pass
        _req("POST", f"/api/sessions/{name}/start", session_name=name)
    return _wait_for_qr_status(name)


def reset_session(name=None, user_id=None):
    """Full logout + restart — use when QR scan fails or session is FAILED."""
    with use_waha_user(_resolve_user_id(user_id), assign=True):
        name = _session_name(name)
        try:
            _req("POST", f"/api/sessions/{name}/stop", session_name=name)
        except WahaError:
            pass
        try:
            _req("POST", f"/api/sessions/{name}/logout", session_name=name)
        except WahaError:
            pass
        return restart_session(name)


def _wait_for_qr_status(name, timeout=25):
    import time

    end = time.time() + timeout
    last = None
    restarted = False
    while time.time() < end:
        st = session_status(name)
        last = st
        status = st.get("status")
        if st.get("connected") or status == "SCAN_QR_CODE":
            return st
        if status == "FAILED" and not restarted:
            try:
                _req("POST", f"/api/sessions/{_session_name(name)}/restart", session_name=name)
                restarted = True
            except WahaError:
                pass
        time.sleep(1.5)
    return last or session_status(name)


def start_session(name=None, user_id=None):
    with use_waha_user(_resolve_user_id(user_id), assign=True):
        name = _session_name(name)
        st = session_status(name)
        if st.get("connected"):
            return st
        status = st.get("status")
        if status == "FAILED":
            return restart_session(name)
        if status == "SCAN_QR_CODE":
            return st
        if status == "STARTING":
            return _wait_for_qr_status(name)
        try:
            _req("POST", "/api/sessions", session_name=name, json={"name": name, "start": True})
        except WahaError as e:
            msg = str(e)
            lower = msg.lower()
            if "already exists" in lower or "already started" in lower:
                if status == "STOPPED":
                    try:
                        _req("POST", f"/api/sessions/{name}/start", session_name=name)
                    except WahaError as e2:
                        if "already started" not in str(e2).lower():
                            raise
                else:
                    return restart_session(name)
            else:
                try:
                    _req("POST", f"/api/sessions/{name}/start", session_name=name)
                except WahaError as e2:
                    if "already started" not in str(e2).lower():
                        raise WahaError(msg) from e
        return _wait_for_qr_status(name)


def session_status(name=None, user_id=None):
    uid = _resolve_user_id(user_id)
    if uid is not None and not _assign_ctx.get():
        from app.services.waha_slots import get_user_slot

        if get_user_slot(uid) is None:
            return {
                "name": CORE_SESSION,
                "status": "UNLINKED",
                "connected": False,
                "slot": None,
                "detail": "WhatsApp not linked for this account yet — scan QR to connect your own number",
            }

    with use_waha_user(uid, assign=_assign_ctx.get()):
        name = _session_name(name)
        cfg = _cfg(name)
        try:
            data = _req("GET", f"/api/sessions/{name}", session_name=name)
        except WahaError as e:
            return {
                "name": name,
                "status": "ERROR",
                "connected": False,
                "error": str(e),
                "slot": cfg.get("slot"),
            }
        status = (data.get("status") or data.get("state") or "").upper()
        connected = status in _CONNECTED
        out = {
            "name": name,
            "status": status or "UNKNOWN",
            "connected": connected,
            "raw": data,
            "slot": cfg.get("slot"),
        }
        if status == "SCAN_QR_CODE":
            out["needsQr"] = True
        return out


def get_qr(name=None, user_id=None):
    with use_waha_user(_resolve_user_id(user_id), assign=True):
        name = _session_name(name)
        cfg = _cfg(name)
        if not cfg["key"]:
            raise WahaError("WAHA API key not configured")
        st = session_status(name)
        if st.get("error"):
            raise WahaError(st["error"])
        status = st.get("status")
        if status == "FAILED":
            st = restart_session(name)
        elif status in ("STOPPED", "ERROR", "UNLINKED"):
            st = start_session(name)
        elif status == "STARTING":
            st = _wait_for_qr_status(name)
        status = st.get("status")
        if status == "FAILED":
            raise WahaError("WAHA session failed — click Reset & new QR, then scan again")
        if status not in ("SCAN_QR_CODE",) and not st.get("connected"):
            st = _wait_for_qr_status(name, timeout=15)
            status = st.get("status")
        if status != "SCAN_QR_CODE":
            if st.get("connected"):
                return {"format": "text", "data": "", "connected": True, "slot": cfg.get("slot")}
            raise WahaError(
                f"QR not ready (status: {status or 'unknown'}) — wait a moment or use Reset & new QR"
            )
        url = f"{cfg['base']}/api/{name}/auth/qr"
        r = requests.get(url, headers=_headers(cfg["key"]), timeout=45)
        if r.status_code == 401:
            raise WahaError("WAHA unauthorized — API key does not match WAHA_API_KEY in Docker")
        if r.status_code == 422:
            body = r.text or ""
            if "not as expected" in body.lower() or "FAILED" in body:
                restart_session(name)
                r = requests.get(url, headers=_headers(cfg["key"]), timeout=45)
        if r.status_code >= 400:
            raise WahaError(_parse_error(r.text, r.status_code))
        ct = r.headers.get("content-type", "")
        if "image" in ct:
            b64 = base64.b64encode(r.content).decode("ascii")
            return {"format": "image", "data": f"data:{ct};base64,{b64}", "slot": cfg.get("slot")}
        try:
            data = r.json()
            if data.get("qr"):
                return {"format": "text", "data": data["qr"], "slot": cfg.get("slot")}
            if data.get("value"):
                return {"format": "text", "data": data["value"], "slot": cfg.get("slot")}
        except ValueError:
            pass
        raw = (r.text or "").strip()
        if raw and not raw.startswith("{"):
            return {"format": "text", "data": raw, "slot": cfg.get("slot")}
        raise WahaError("QR code not available yet — wait a few seconds and try again")


def stop_session(name=None, user_id=None):
    with use_waha_user(_resolve_user_id(user_id), assign=False):
        name = _session_name(name)
        try:
            _req("POST", f"/api/sessions/{name}/stop", session_name=name)
        except WahaError:
            pass
        return {"ok": True}


def send_text(chat_id, text, session=None):
    session = _session_name(session)
    payload = {"session": session, "chatId": chat_id, "text": text}
    try:
        return _req("POST", "/api/sendText", session_name=session, json=payload)
    except WahaError as e:
        # Recover once from transient WAHA WEBJS/Puppeteer crashes.
        if _is_transient_webjs_error(str(e)):
            restart_session(session)
            _wait_for_qr_status(session, timeout=20)
            return _req("POST", "/api/sendText", session_name=session, json=payload)
        raise


def phone_chat_id(phone):
    p = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return f"{p}@c.us" if p else ""


def get_labels(session=None):
    """WhatsApp Business labels for the linked session."""
    name = _session_name(session)
    data = _req("GET", f"/api/{name}/labels", session_name=name)
    return _normalize_waha_items(data)


def get_chats_for_label(label_id, session=None):
    """Chats that carry a given WhatsApp Business label."""
    name = _session_name(session)
    lid = str(label_id or "").strip()
    if not lid:
        return []
    try:
        data = _req("GET", f"/api/{name}/labels/{lid}/chats", session_name=name)
    except WahaError:
        # Alternate path used by some WAHA builds / docs
        data = _req("GET", f"/api/{name}/chats/label/{lid}", session_name=name)
    return _normalize_waha_items(data)


def phone_from_chat(chat):
    """Extract E.164-ish digits from a WAHA chat/contact payload (skip groups)."""
    if not isinstance(chat, dict):
        return ""
    gid = _chat_id(chat)
    if _is_group_chat(chat, gid):
        return ""
    for key in ("phone", "number", "phoneNumber"):
        val = chat.get(key)
        if val:
            p = "".join(ch for ch in str(val) if ch.isdigit())
            if len(p) >= 8:
                return p
    if isinstance(gid, str) and gid:
        user = gid.split("@")[0].split(":")[0]
        p = "".join(ch for ch in user if ch.isdigit())
        if len(p) >= 8 and not gid.endswith("@g.us"):
            return p
    return ""


_chat_cache = {}


def _norm_name(s):
    import unicodedata

    raw = unicodedata.normalize("NFKC", (s or "").strip().lower())
    # Normalize common variants so "O'LEVEL", "O’LEVEL" and similar names match.
    raw = raw.replace("&", " and ")
    cleaned = []
    for ch in raw:
        if ch.isalnum():
            cleaned.append(ch)
        else:
            cleaned.append(" ")
    return " ".join("".join(cleaned).split())


def _group_label(g):
    direct = g.get("name") or g.get("subject") or g.get("title")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    for key in ("pushName", "notifyName", "formattedName"):
        val = g.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # Some WAHA engines return nested chat/contact objects.
    for key in ("chat", "contact", "group"):
        node = g.get(key)
        if isinstance(node, dict):
            val = (
                node.get("name")
                or node.get("subject")
                or node.get("title")
                or node.get("pushName")
                or node.get("notifyName")
                or node.get("formattedName")
            )
            if isinstance(val, str) and val.strip():
                return val.strip()
    return ""


def _chat_id(g):
    raw = g.get("id") or g.get("jid") or g.get("chatId")
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        # WAHA/WebJS commonly uses object IDs.
        for k in ("_serialized", "serialized", "id", "jid", "chatId"):
            v = raw.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        user = raw.get("user")
        server = raw.get("server")
        if user and server:
            return f"{user}@{server}"
    return ""


def _is_group_chat(g, gid):
    gid_s = str(gid or "")
    if gid_s.endswith("@g.us"):
        return True
    # Fallback for engines that expose flags/type fields.
    if g.get("isGroup") is True or g.get("group") is True:
        return True
    chat_type = str(g.get("type") or g.get("chatType") or "").lower()
    if chat_type in {"group", "groups", "g.us"}:
        return True
    # Group payloads often include participants/member lists.
    if isinstance(g.get("participants"), list) or isinstance(g.get("members"), list):
        return True
    return False


def _normalize_waha_items(data):
    """WAHA engines return lists or dicts (NOWEB /groups is {chatId: group})."""
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []
    for key in ("chats", "groups", "data", "items"):
        val = data.get(key)
        if isinstance(val, list):
            return val
        if isinstance(val, dict):
            return list(val.values())
    if not data:
        return []
    sample = next(iter(data.values()), None)
    if isinstance(sample, dict) and (
        any(str(k).endswith("@g.us") for k in data.keys())
        or sample.get("subject")
        or sample.get("id")
    ):
        return list(data.values())
    return []


def _fetch_chat_items(session):
    import time

    session = _session_name(session)
    now = time.time()
    cached = _chat_cache.get(session)
    if cached and now - cached["ts"] < 120:
        return cached["items"]

    def _load_groups(refresh=False):
        if refresh:
            try:
                _req("POST", f"/api/{session}/groups/refresh", session_name=session, timeout=180)
            except WahaError:
                pass
        data = _req(
            "GET",
            f"/api/{session}/groups?exclude=participants&limit=500",
            session_name=session,
            timeout=120,
        )
        return _normalize_waha_items(data)

    items = []
    tried_recover = False
    while True:
        try:
            items = _load_groups(refresh=False)
            if not items:
                items = _load_groups(refresh=True)
            if not items:
                data = _req(
                    "GET",
                    f"/api/{session}/chats/overview?limit=500",
                    session_name=session,
                    timeout=120,
                )
                items = _normalize_waha_items(data)
            break
        except WahaError as e1:
            if not tried_recover and _is_transient_webjs_error(str(e1)):
                tried_recover = True
                restart_session(session)
                _wait_for_qr_status(session, timeout=20)
                continue
            raise

    _chat_cache[session] = {"ts": now, "items": items}
    return items


def list_groups(session=None):
    """Return WhatsApp groups visible in the linked WAHA session."""
    session = _session_name(session)
    items = _fetch_chat_items(session)
    out = []
    seen = set()
    for g in items:
        if not isinstance(g, dict):
            continue
        gid = _chat_id(g)
        if not gid:
            continue
        if not _is_group_chat(g, gid):
            # NOWEB group payloads may omit flags; @g.us id is enough.
            if not str(gid).endswith("@g.us"):
                continue
        label = _group_label(g)
        if not label or gid in seen:
            continue
        seen.add(gid)
        out.append({"id": gid, "name": label})
    out.sort(key=lambda x: x["name"].lower())
    return out


def find_group_chat_id(name, session=None, items=None):
    session = _session_name(session)
    if items is None:
        try:
            items = _fetch_chat_items(session)
        except WahaError:
            return None
    name_n = _norm_name(name)
    partial = []
    for g in items:
        if not isinstance(g, dict):
            continue
        gid = _chat_id(g)
        if not gid:
            continue
        if not _is_group_chat(g, gid) and not str(gid).endswith("@g.us"):
            continue
        gname = _group_label(g)
        gn = _norm_name(gname)
        if gn == name_n:
            return gid
        if name_n in gn or gn in name_n:
            partial.append((gname, gid))
    if len(partial) == 1:
        return partial[0][1]
    return None


def _group_not_found_message(name, session=None):
    try:
        groups = list_groups(session)
        name_n = _norm_name(name)
        similar = [g["name"] for g in groups if name_n in _norm_name(g["name"]) or _norm_name(g["name"]) in name_n]
        if similar:
            return f"Group not found in WAHA session: {name} (similar: {', '.join(similar[:3])})"
        if groups:
            sample = ", ".join(g["name"] for g in groups[:5])
            return f"Group not found in WAHA session: {name}. Examples: {sample}"
    except WahaError:
        pass
    return f"Group not found in WAHA session: {name}"


def send_to_target(name, message, phone=None, session=None, user_id=None):
    with use_waha_user(_resolve_user_id(user_id), assign=False):
        session = _session_name(session)
        text = (message or "").strip()
        if not text:
            return False, "Empty message"
        if phone:
            cid = phone_chat_id(phone)
            if not cid:
                return False, "Invalid phone"
            send_text(cid, text, session)
            return True, None
        gid = find_group_chat_id(name, session)
        if not gid:
            return False, _group_not_found_message(name, session)
        send_text(gid, text, session)
        return True, None
