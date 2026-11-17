"""Talk to the scheduler assistant from WhatsApp.

The teacher opens "Message yourself" in WhatsApp and writes a message starting with
"ssies", e.g. "ssies move CS on Tuesday to 5pm". Once a minute this reads that chat
(through WAHA's message store), asks the assistant, and replies in the same chat with
what it would change. Nothing is saved until the teacher answers "ssies yes".

Only the account's own messages in its own chat are read, so nobody else can drive it.
State per user lives in system_settings["wa_assistant:<user id>"]:
{"enabled", "last_ts", "pending": {"changes", "at"}}.
"""
from __future__ import annotations

import logging
import re
import time
import uuid

log = logging.getLogger(__name__)

PREFIX = re.compile(r"^\s*ssies\b[\s:,.\-]*(.*)$", re.I | re.S)
PENDING_TTL_S = 30 * 60
HEAD = "🤖 *SSIES assistant*\n"
YES = {"yes", "y", "ok", "okay", "apply", "save", "confirm", "haan", "han", "ji"}
NO = {"no", "n", "cancel", "stop", "nahi", "discard"}
HELP = (HEAD + "Start a message with *ssies* and say what to change, for example:\n"
        "• ssies move CS on Tuesday to 5pm\n• ssies no Math class on Friday\n"
        "I reply with the change; answer *ssies yes* to save it or *ssies no* to drop it.")


def key(uid):
    return f"wa_assistant:{uid}"


def get_state(uid):
    from app.services.users import get_system_setting
    s = get_system_setting(key(uid), None)
    return s if isinstance(s, dict) else {"enabled": False, "last_ts": 0, "pending": None}


def set_state(uid, s):
    from app.services.users import set_system_setting
    set_system_setting(key(uid), s)


def new_commands(msgs, last_ts):
    """From the self-chat messages, the "ssies …" texts newer than last_ts (oldest first),
    and the newest timestamp seen."""
    newest, cmds = last_ts, []
    for m in sorted(msgs, key=lambda m: int(m.get("timestamp") or 0)):
        ts = int(m.get("timestamp") or 0)
        if ts <= last_ts:
            continue
        newest = max(newest, ts)
        if not m.get("fromMe"):
            continue
        hit = PREFIX.match(str(m.get("body") or ""))
        if hit:
            cmds.append(hit.group(1).strip())
    return cmds, newest


def _slot(g, day):
    return next((e for e in (g.get("schedule") or []) if e.get("day") == day), None)


def _span(e):
    return f"{e.get('from') or '?'}–{e.get('to') or '?'}" if e else ""


def describe(changes, groups):
    """Readable lines for a WhatsApp message."""
    by = {g["name"]: g for g in groups}
    out = []
    for c in changes:
        g = by.get(c["group"]) or {"schedule": []}
        was = _slot(g, c.get("day"))
        if c["op"] == "create_group":
            out.append(f"• New group: *{c['group']}*")
        elif c["op"] == "clear":
            out.append(f"• *{c['group']}* — no class on {c['day']}" + (f" (was {_span(was)})" if was else ""))
        else:
            now = f"{c['from']}–{c['to']}" if c.get("to") else c["from"]
            out.append(f"• *{c['group']}* — {c['day']} {now}" + (f" (was {_span(was)})" if was else ""))
    return out


def apply_to(groups, changes):
    """Apply changes to [{name, schedule}] in place (same rules as the in-app assistant:
    a new time keeps that day's room and teacher). Returns the names of new groups."""
    from app.config import DAYS
    by, created = {g["name"]: g for g in groups}, []
    for c in changes:
        g = by.get(c["group"])
        if c["op"] == "create_group":
            if not g:
                g = {"name": c["group"], "schedule": []}
                groups.append(g); by[g["name"]] = g; created.append(g["name"])
            continue
        if not g:
            continue
        was = _slot(g, c["day"]) or {}
        sched = [e for e in (g.get("schedule") or []) if e.get("day") != c["day"]]
        if c["op"] == "set":
            extra = {k: was[k] for k in ("room", "teacher") if was.get(k)}
            sched.append({**extra, "day": c["day"], "from": c["from"], "to": c.get("to") or ""})
        sched.sort(key=lambda e: DAYS.index(e["day"]) if e.get("day") in DAYS else 9)
        g["schedule"] = sched
    return created


def _db_groups(uid):
    from app.models import Group
    return Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()


def save_changes(uid, changes):
    from app.crypto import enc
    from app.models import Group, db
    from app.routes.user_routes import _snapshot_groups
    rows = _db_groups(uid)
    groups = [{"name": r.name, "schedule": list(r.schedule or [])} for r in rows]
    created = apply_to(groups, changes)
    _snapshot_groups(uid, "the WhatsApp assistant")
    by = {r.name: r for r in rows}
    for g in groups:
        r = by.get(g["name"])
        if r is None and g["name"] in created:
            r = Group(user_id=uid, name=g["name"], message_enc=enc(""), position=len(rows))
            db.session.add(r)
        if r is not None:
            r.schedule = g["schedule"]
    db.session.commit()


def handle(uid, text, ask):
    """One command → the reply to send. ask(groups, text) returns the assistant's answer."""
    s = get_state(uid)
    word = text.lower().strip(" .!?")
    if not word or word in ("help", "?"):
        return HELP
    if word in YES:
        p = s.get("pending")
        if not p or time.time() - p.get("at", 0) > PENDING_TTL_S:
            s["pending"] = None; set_state(uid, s)
            return HEAD + "There is nothing waiting to be saved. Send a new request."
        save_changes(uid, p["changes"])
        s["pending"] = None; set_state(uid, s)
        return HEAD + "✅ Saved. The schedule in the app is updated; you can undo it there from the schedule history."
    if word in NO:
        had = bool(s.get("pending"))
        s["pending"] = None; set_state(uid, s)
        return HEAD + ("Dropped — nothing was changed." if had else "There was nothing waiting.")
    rows = _db_groups(uid)
    groups = [{"name": r.name, "nickname": r.nickname or "", "schedule": r.schedule or []} for r in rows]
    try:
        res = ask(groups, text)
    except (RuntimeError, ValueError) as e:
        return HEAD + f"Sorry — {e}"
    lines = [HEAD + (res.get("reply") or "").strip()]
    if res.get("changes"):
        lines += ["", "*Proposed changes*"] + describe(res["changes"], groups)
        lines += ["", "Reply *ssies yes* to save, or *ssies no* to drop it."]
        s["pending"] = {"changes": res["changes"], "at": time.time()}
    else:
        s["pending"] = None
    if res.get("skipped"):
        lines += ["", "Not understood: " + "; ".join(res["skipped"][:4])]
    if res.get("notice"):
        lines += ["", "To send a cancel or reschedule notice to a group, use the app."]
    set_state(uid, s)
    return "\n".join(x for x in lines if x is not None).strip()


def _ask_live(groups, text):
    from app.routes.user_routes import _assistant_cfg, _assistant_local_cfg
    from app.services import assistant
    cfg, local = _assistant_cfg(), _assistant_local_cfg()
    if not (all(cfg.values()) or all(local.values())):
        raise RuntimeError("the assistant is not set up yet. An admin can add it in Settings → Automation.")
    return assistant.ask_with_fallback(groups, text, cfg, local)


def poll_user(uid):
    from app.services import waha_client as w
    s = get_state(uid)
    if not s.get("enabled"):
        return
    with w.use_waha_user(uid, assign=False):
        name = w._session_name()
        info = w._req("GET", f"/api/sessions/{name}", session_name=name) or {}
        me = (info.get("me") or {}).get("id")
        if info.get("status") != "WORKING" or not me:
            return
        msgs = w._req("GET", f"/api/{name}/chats/{me}/messages?limit=15&downloadMedia=false", session_name=name) or []
        cmds, newest = new_commands(msgs, int(s.get("last_ts") or 0))
        if newest != s.get("last_ts"):
            s["last_ts"] = newest; set_state(uid, s)   # mark read first: a crash must not repeat a command
        for text in cmds:
            reply = handle(uid, text, _ask_live)
            w.send_text(me, reply, name)


def tick(app):
    """Scheduler job (every minute): poll each user who turned this on."""
    from app.models import SystemSetting
    from app.services.users import maintenance_mode
    with app.app_context():
        if maintenance_mode():
            return
        rows = SystemSetting.query.filter(SystemSetting.key.like("wa_assistant:%")).all()
        for r in rows:
            v = r.value if isinstance(r.value, dict) else {}
            if not v.get("enabled"):
                continue
            try:
                uid = uuid.UUID(r.key.split(":", 1)[1])
                poll_user(uid)
            except Exception:
                log.exception("WhatsApp assistant poll failed for %s", uid)
