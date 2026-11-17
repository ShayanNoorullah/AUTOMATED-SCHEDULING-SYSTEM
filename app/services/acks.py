"""Who has seen or answered a message sent to a WhatsApp group.

Worked out on demand from what WAHA (NOWEB, store on) already keeps — nothing is stored:
- the message we sent is the one from us closest to the send time in the history;
- its ``_data.userReceipt`` lists each member's delivery / read time;
- any message or reaction a member posts in the group after it counts as an answer.
"""
from __future__ import annotations

from datetime import datetime, timezone

MATCH_WINDOW_S = 300          # the logged send time and WhatsApp's timestamp differ by seconds
STATES = ("replied", "read", "delivered", "waiting")


def _digits(s):
    return "".join(ch for ch in str(s or "") if ch.isdigit())


def _sender(m):
    d = m.get("_data") or {}
    key = d.get("key") or {}
    return m.get("participant") or key.get("participant") or key.get("participantAlt") or d.get("participant") or ""


def find_sent(msgs, sent_ts):
    """The message we sent nearest to sent_ts (unix seconds), or None."""
    best, gap = None, MATCH_WINDOW_S + 1
    for m in msgs:
        if not m.get("fromMe") or not m.get("timestamp"):
            continue
        d = abs(int(m["timestamp"]) - sent_ts)
        if d < gap:
            best, gap = m, d
    return best


def summarize(target, msgs, participants, me_ids, names):
    """target: our message; msgs: the chat's messages; participants: [{id, phoneNumber}];
    me_ids: our own ids (any form); names: phone digits -> display name.
    Returns {"total", "counts", "people": [{"name", "phone", "state", "at"}]}."""
    me = {_digits(x) for x in me_ids if x}
    ts0 = int(target.get("timestamp") or 0)
    # one person can appear as a lid (…@lid) and as a phone (…@c.us / @s.whatsapp.net)
    people, alias = [], {}
    for p in participants or []:
        pid, phone = str(p.get("id") or ""), _digits(p.get("phoneNumber") or "")
        if not phone and not pid.endswith("@lid"):
            phone = _digits(pid)
        if _digits(pid) in me or (phone and phone in me):
            continue
        row = {"phone": phone, "state": "waiting", "at": None}
        people.append(row)
        for k in (_digits(pid), phone):
            if k:
                alias[k] = row

    def bump(who, state, ts):
        row = alias.get(_digits(who))
        if row and STATES.index(state) < STATES.index(row["state"]):
            row["state"], row["at"] = state, ts

    for r in (target.get("_data") or {}).get("userReceipt") or []:
        if r.get("readTimestamp"):
            bump(r.get("userJid"), "read", int(r["readTimestamp"]))
        elif r.get("receiptTimestamp"):
            bump(r.get("userJid"), "delivered", int(r["receiptTimestamp"]))
    pushnames = {}
    for m in msgs:
        if m.get("fromMe") or int(m.get("timestamp") or 0) < ts0:
            continue
        who = _sender(m)
        bump(who, "replied", int(m.get("timestamp") or 0))
        pn = (m.get("_data") or {}).get("pushName")
        if pn:
            pushnames[_digits(who)] = pn

    out = []
    for row in people:
        nm = names.get(row["phone"]) or next((pushnames[k] for k, v in alias.items() if v is row and k in pushnames), "")
        at = datetime.fromtimestamp(row["at"], tz=timezone.utc).isoformat() if row["at"] else None
        out.append({"name": nm or (f"+{row['phone']}" if row["phone"] else "Unknown member"), "phone": row["phone"], "state": row["state"], "at": at})
    out.sort(key=lambda r: (STATES.index(r["state"]), r["name"].lower()))
    counts = {s: sum(1 for r in out if r["state"] == s) for s in STATES}
    return {"total": len(out), "counts": counts, "people": out}


def acks_for_send(user_id, group_name, sent_at, contact_names=None):
    """sent_at: naive UTC datetime from release_log. Raises RuntimeError with a readable message."""
    from app.services import waha_client as w

    with w.use_waha_user(user_id, assign=False):
        name = w._session_name()
        try:
            info = w._req("GET", f"/api/sessions/{name}", session_name=name) or {}
        except w.WahaError as e:
            raise RuntimeError(f"WhatsApp could not be reached: {e}")
        if info.get("status") != "WORKING":
            raise RuntimeError("WhatsApp is not connected. Link it on Automated Send, then try again.")
        gid = w.find_group_chat_id(group_name, name)
        if not gid:
            raise RuntimeError(f"Could not find the WhatsApp group “{group_name}”.")
        msgs = w._req("GET", f"/api/{name}/chats/{gid}/messages?limit=200&downloadMedia=false", session_name=name) or []
        sent_ts = int(sent_at.replace(tzinfo=timezone.utc).timestamp())
        target = find_sent(msgs, sent_ts)
        if not target:
            return {"found": False, "group": group_name}
        grp = w._req("GET", f"/api/{name}/groups/{gid}", session_name=name) or {}
        me = info.get("me") or {}
        names = {}
        try:
            names.update(w.get_contact_directory(name, lid_map={}))
        except Exception:
            pass
        names.update({_digits(k): v for k, v in (contact_names or {}).items() if v})
        res = summarize(target, msgs, grp.get("participants") or [], [me.get("id"), me.get("lid")], names)
        sent_iso = datetime.fromtimestamp(int(target["timestamp"]), tz=timezone.utc).isoformat()
        return dict(res, found=True, group=group_name, sentAt=sent_iso)
