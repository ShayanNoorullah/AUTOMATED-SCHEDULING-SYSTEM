"""One-off changes, the calendar feed and reminder de-duplication.

Run:  python tests/test_schedule_extras.py
"""
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402

from app.models import db  # noqa: E402
from app.services import schedule_extras as x  # noqa: E402
from app.services.scheduler import claim_reminder  # noqa: E402

SCHED = [{"day": "Monday", "from": "3:00pm", "to": "4:30pm"}, {"day": "Friday", "from": "1:00pm", "to": ""}]


def ex(group_id, kind="cancel", start="", end="", day="2026-11-16"):
    return {"group_id": group_id, "date": day, "kind": kind, "from_time": start, "to_time": end}


def main():
    # ── effective_slot: what class a group has on one date ──
    slot = x.effective_slot
    assert slot(SCHED, "Monday", 1, []) == {"from": "3:00pm", "to": "4:30pm"}
    assert slot(SCHED, "Tuesday", 1, []) is None
    assert slot(SCHED, "Monday", 1, [ex(1)]) is None                               # cancelled
    assert slot(SCHED, "Monday", 1, [ex(2)]) == {"from": "3:00pm", "to": "4:30pm"}  # another group's change
    assert slot(SCHED, "Monday", 1, [ex(None)]) is None                            # holiday
    assert slot(SCHED, "Monday", 1, [ex(1, "move", "5:00pm", "6:00pm")]) == {"from": "5:00pm", "to": "6:00pm"}
    assert slot(SCHED, "Tuesday", 1, [ex(1, "extra", "9:00am")]) == {"from": "9:00am", "to": ""}
    assert slot(SCHED, "Tuesday", 1, [ex(1, "extra", "9:00am"), ex(None)]) is None  # holiday beats an extra class

    # ── calendar feed ──
    groups = [{"id": 7, "name": "CS, Batch; A", "schedule": SCHED}]
    changes = [ex(7, "cancel", day="2026-11-23"),                      # a Monday: excluded from the repeat
               ex(7, "move", "6:00pm", "7:00pm", day="2026-11-20"),    # a Friday: excluded + single event
               ex(7, "extra", "10:00am", day="2026-11-18"),            # a Wednesday: single event
               ex(None, day="2026-11-30")]                             # holiday on a Monday
    ics = x.build_ics(groups, changes, date(2026, 11, 18), now=datetime(2026, 11, 18, 9, 0, 0))
    lines = ics.split("\r\n")
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-2] == "END:VCALENDAR" and ics.endswith("\r\n")
    assert ics.count("BEGIN:VEVENT") == 4 and ics.count("RRULE:FREQ=WEEKLY") == 2
    assert "SUMMARY:CS\\, Batch\\; A" in ics
    assert "DTSTART:20261116T150000" in ics and "DTEND:20261116T163000" in ics     # Monday of that week, 3:00–4:30pm
    assert "DTSTART:20261120T130000" in ics and "DTEND:20261120T140000" in ics     # no end time: one hour
    assert "EXDATE:20261123T150000" in ics and "EXDATE:20261130T150000" in ics     # cancelled Monday, holiday Monday
    assert "EXDATE:20261120T130000" in ics and "DTSTART:20261120T180000" in ics     # moved Friday
    assert "DTSTART:20261118T100000" in ics                                         # extra class
    assert all(len(l.encode("utf-8")) <= 75 for l in lines)
    long_name = x.build_ics([{"id": 1, "name": "Ω" * 120, "schedule": SCHED[:1]}], [], date(2026, 11, 18))
    assert all(len(l.encode("utf-8")) <= 75 for l in long_name.split("\r\n"))
    assert "Ω" * 120 in long_name.replace("\r\n ", "")                              # folding loses nothing

    # ── link token: stable per user, different per user and per secret ──
    t = x.feed_token("secret", "user-1")
    assert len(t) == 32 and t == x.feed_token("secret", "user-1")
    assert t != x.feed_token("secret", "user-2") and t != x.feed_token("other", "user-1")

    # ── a reminder is claimed once, even by a fresh process ──
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        assert claim_reminder("u|1|2026-11-16|3:00pm") is True
        assert claim_reminder("u|1|2026-11-16|3:00pm") is False
        assert claim_reminder("u|1|2026-11-17|3:00pm") is True
    print("ok")


if __name__ == "__main__":
    main()
