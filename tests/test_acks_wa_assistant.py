"""Acknowledgement tracking and the WhatsApp assistant — the logic, without WhatsApp.

Run:  python tests/test_acks_wa_assistant.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import acks, wa_assistant as wa  # noqa: E402


def test_acks():
    T = 1_800_000_000
    sent = {"fromMe": True, "timestamp": T + 4, "_data": {"userReceipt": [
        {"userJid": "111@lid", "receiptTimestamp": T + 10, "readTimestamp": T + 60},     # Ali: read
        {"userJid": "222@lid", "receiptTimestamp": T + 12},                               # Sara: delivered
        {"userJid": "333@lid", "receiptTimestamp": T + 9, "readTimestamp": T + 30},      # Omar: read, then replied
    ]}}
    msgs = [
        {"fromMe": True, "timestamp": T - 86400},                                          # an older send
        sent,
        {"fromMe": False, "timestamp": T + 100, "participant": "923330000003@c.us", "_data": {"pushName": "Omar"}},
        {"fromMe": False, "timestamp": T - 50, "participant": "222@lid"},                  # before the send: ignored
    ]
    parts = [
        {"id": "111@lid", "phoneNumber": "923330000001@s.whatsapp.net"},
        {"id": "222@lid", "phoneNumber": "923330000002@s.whatsapp.net"},
        {"id": "333@lid", "phoneNumber": "923330000003@s.whatsapp.net"},
        {"id": "444@lid", "phoneNumber": "923330000004@s.whatsapp.net"},                  # nothing yet
        {"id": "999@lid", "phoneNumber": "923000000000@s.whatsapp.net"},                  # me
    ]
    assert acks.find_sent(msgs, T) is sent
    assert acks.find_sent(msgs, T + 3600) is None                                          # too far from any send
    r = acks.summarize(sent, msgs, parts, ["923000000000@c.us", "999@lid"], {"923330000001": "Ali Khan"})
    assert r["total"] == 4, r
    assert r["counts"] == {"replied": 1, "read": 1, "delivered": 1, "waiting": 1}, r["counts"]
    by = {p["phone"]: p for p in r["people"]}
    assert by["923330000003"]["state"] == "replied" and by["923330000003"]["name"] == "Omar"
    assert by["923330000001"]["state"] == "read" and by["923330000001"]["name"] == "Ali Khan"
    assert by["923330000002"]["state"] == "delivered"
    assert by["923330000004"]["state"] == "waiting" and by["923330000004"]["name"] == "+923330000004"
    assert [p["state"] for p in r["people"]] == ["replied", "read", "delivered", "waiting"]


def test_commands():
    msgs = [
        {"fromMe": True, "timestamp": 100, "body": "ssies move CS to 5pm"},          # already handled
        {"fromMe": True, "timestamp": 205, "body": "SSIES: yes"},
        {"fromMe": True, "timestamp": 200, "body": "ssies move CS on Tuesday to 5pm"},
        {"fromMe": True, "timestamp": 210, "body": "buy milk"},                       # a normal note
        {"fromMe": True, "timestamp": 220, "body": "🤖 *SSIES assistant*\nSaved"},    # our own reply
        {"fromMe": False, "timestamp": 230, "body": "ssies clear everything"},         # not from the owner
        {"fromMe": True, "timestamp": 240, "body": "ssiesx nope"},                    # not the word ssies
    ]
    cmds, newest = wa.new_commands(msgs, 100)
    assert cmds == ["move CS on Tuesday to 5pm", "yes"], cmds
    assert newest == 240
    assert wa.new_commands(msgs, 240) == ([], 240)


def test_apply_and_describe():
    groups = [{"name": "CS", "schedule": [{"day": "Tuesday", "from": "3:00pm", "to": "4:30pm", "room": "Lab 2"},
                                          {"day": "Friday", "from": "9:00am", "to": "10:00am"}]}]
    changes = [{"op": "set", "group": "CS", "day": "Tuesday", "from": "5:00pm", "to": "6:30pm"},
               {"op": "clear", "group": "CS", "day": "Friday"},
               {"op": "create_group", "group": "Physics"},
               {"op": "set", "group": "Physics", "day": "Monday", "from": "2:00pm", "to": ""}]
    lines = wa.describe(changes, groups)
    assert lines[0] == "• *CS* — Tuesday 5:00pm–6:30pm (was 3:00pm–4:30pm)", lines
    assert lines[1] == "• *CS* — no class on Friday (was 9:00am–10:00am)"
    assert lines[2] == "• New group: *Physics*" and lines[3] == "• *Physics* — Monday 2:00pm"
    created = wa.apply_to(groups, changes)
    assert created == ["Physics"]
    assert groups[0]["schedule"] == [{"room": "Lab 2", "day": "Tuesday", "from": "5:00pm", "to": "6:30pm"}]
    assert groups[1] == {"name": "Physics", "schedule": [{"day": "Monday", "from": "2:00pm", "to": ""}]}


def test_handle():
    store, saved = {}, []
    wa.get_state = lambda uid: dict(store.get(uid) or {"enabled": True, "last_ts": 0, "pending": None})
    wa.set_state = lambda uid, s: store.__setitem__(uid, dict(s))

    class Row:
        def __init__(self, name, schedule):
            self.name, self.nickname, self.schedule = name, "", schedule
    wa._db_groups = lambda uid: [Row("CS", [{"day": "Tuesday", "from": "3:00pm", "to": "4:30pm"}])]
    wa.save_changes = lambda uid, ch: saved.append(ch)
    ask = lambda groups, text: {"reply": "Moving CS.", "changes": [{"op": "set", "group": "CS", "day": "Tuesday", "from": "5:00pm", "to": "6:30pm"}], "skipped": [], "notice": None}

    assert "ssies yes" in wa.handle("u", "help", ask)
    out = wa.handle("u", "move CS on Tuesday to 5pm", ask)
    assert "Proposed changes" in out and "(was 3:00pm–4:30pm)" in out and "ssies yes" in out, out
    assert store["u"]["pending"]
    assert "Saved" in wa.handle("u", "Yes!", ask) and len(saved) == 1
    assert "nothing waiting" in wa.handle("u", "yes", ask)                       # pending was used up
    wa.handle("u", "move CS", ask)
    assert "Dropped" in wa.handle("u", "no", ask) and len(saved) == 1
    wa.handle("u", "move CS", ask)
    store["u"]["pending"]["at"] = time.time() - wa.PENDING_TTL_S - 5             # too old to apply
    assert "nothing waiting" in wa.handle("u", "yes", ask) and len(saved) == 1

    def broken(groups, text):
        raise RuntimeError("the assistant is not set up yet.")
    assert "Sorry — the assistant is not set up yet." in wa.handle("u", "move CS", broken)


if __name__ == "__main__":
    test_acks(); test_commands(); test_apply_and_describe(); test_handle()
    print("ok: acks + WhatsApp assistant")
