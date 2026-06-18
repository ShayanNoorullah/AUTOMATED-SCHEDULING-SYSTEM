"""WAHA (WhatsApp HTTP API) client."""
import base64

import requests

from app.services.users import get_system_setting

# WAHA Core (free Docker image) only supports one session named "default".
CORE_SESSION = "default"
_CONNECTED = frozenset({"WORKING", "CONNECTED", "OPEN", "AUTHENTICATED"})


class WahaError(Exception):
    pass


def _is_core_only_error(msg):
    return "only 'default' session" in (msg or "").lower()


def _session_name(name=None):
    raw = (name or get_system_setting("waha_session_name", CORE_SESSION) or CORE_SESSION).strip()
    if not raw or raw.lower() == "ssies":
        return CORE_SESSION
    return raw


def _cfg(name=None):
    return {
        "base": (get_system_setting("waha_base_url", "") or "").rstrip("/"),
        "key": get_system_setting("waha_api_key", "") or "",
        "session": _session_name(name),
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
        raise WahaError(str(e)) from e
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
    cfg = _cfg()
    if not cfg["base"]:
        return {"ok": False, "error": "WAHA base URL not configured"}
    if not cfg["key"]:
        return {"ok": False, "error": "WAHA API key not configured"}
    try:
        _req("GET", "/api/sessions")
        return {"ok": True, "session": cfg["session"]}
    except WahaError as e:
        return {"ok": False, "error": str(e)}


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


def reset_session(name=None):
    """Full logout + restart — use when QR scan fails or session is FAILED."""
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


def start_session(name=None):
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
        if _is_core_only_error(msg) and name != CORE_SESSION:
            return start_session(CORE_SESSION)
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


def session_status(name=None):
    name = _session_name(name)
    try:
        data = _req("GET", f"/api/sessions/{name}", session_name=name)
    except WahaError as e:
        msg = str(e)
        if _is_core_only_error(msg) and name != CORE_SESSION:
            return session_status(CORE_SESSION)
        return {"name": name, "status": "ERROR", "connected": False, "error": msg}
    status = (data.get("status") or data.get("state") or "").upper()
    connected = status in _CONNECTED
    out = {"name": name, "status": status or "UNKNOWN", "connected": connected, "raw": data}
    if status == "SCAN_QR_CODE":
        out["needsQr"] = True
    return out


def get_qr(name=None):
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
    elif status in ("STOPPED", "ERROR"):
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
            return {"format": "text", "data": "", "connected": True}
        raise WahaError(
            f"QR not ready (status: {status or 'unknown'}) — wait a moment or use Reset & new QR"
        )
    url = f"{cfg['base']}/api/{name}/auth/qr"
    r = requests.get(url, headers=_headers(cfg["key"]), timeout=45)
    if r.status_code == 401:
        raise WahaError("WAHA unauthorized — API key does not match WAHA_API_KEY in Docker")
    if r.status_code == 422:
        body = r.text or ""
        if _is_core_only_error(body) and name != CORE_SESSION:
            return get_qr(CORE_SESSION)
        if "not as expected" in body.lower() or "FAILED" in body:
            restart_session(name)
            r = requests.get(url, headers=_headers(cfg["key"]), timeout=45)
    if r.status_code >= 400:
        raise WahaError(_parse_error(r.text, r.status_code))
    ct = r.headers.get("content-type", "")
    if "image" in ct:
        b64 = base64.b64encode(r.content).decode("ascii")
        return {"format": "image", "data": f"data:{ct};base64,{b64}"}
    try:
        data = r.json()
        if data.get("qr"):
            return {"format": "text", "data": data["qr"]}
        if data.get("value"):
            return {"format": "text", "data": data["value"]}
    except ValueError:
        pass
    raw = (r.text or "").strip()
    if raw and not raw.startswith("{"):
        return {"format": "text", "data": raw}
    raise WahaError("QR code not available yet — wait a few seconds and try again")


def stop_session(name=None):
    name = _session_name(name)
    try:
        _req("POST", f"/api/sessions/{name}/stop", session_name=name)
    except WahaError:
        pass
    return {"ok": True}


def send_text(chat_id, text, session=None):
    session = _session_name(session)
    return _req("POST", "/api/sendText", session_name=session, json={"session": session, "chatId": chat_id, "text": text})


def phone_chat_id(phone):
    p = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return f"{p}@c.us" if p else ""


_chat_cache = {}


def _norm_name(s):
    return " ".join((s or "").strip().lower().split())


def _group_label(g):
    return (g.get("name") or g.get("subject") or g.get("title") or "").strip()


def _chat_id(g):
    return g.get("id") or g.get("jid") or g.get("chatId")


def _fetch_chat_items(session):
    import time

    session = _session_name(session)
    now = time.time()
    cached = _chat_cache.get(session)
    if cached and now - cached["ts"] < 120:
        return cached["items"]
    try:
        data = _req(
            "GET",
            f"/api/{session}/chats/overview?limit=500",
            session_name=session,
            timeout=120,
        )
    except WahaError:
        data = _req(
            "GET",
            f"/api/{session}/groups?exclude=participants&limit=200",
            session_name=session,
            timeout=90,
        )
    items = data if isinstance(data, list) else data.get("chats") or data.get("groups") or data.get("data") or []
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
        if not gid or not str(gid).endswith("@g.us"):
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
        if not gid or not str(gid).endswith("@g.us"):
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


def send_to_target(name, message, phone=None, session=None):
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
