"""One-off schedule changes and the calendar feed.

A one-off change ("exception") applies to one calendar date and never edits the weekly
timetable: a class is cancelled, moved to another time, or added as an extra; a change with
no group is a day off for every group (a holiday).

Everything here is pure (no database), so it can be checked without the app:
    python tests/test_schedule_extras.py
"""
import hashlib
import hmac
import re
from datetime import datetime, timedelta

from app.config import DAYS

KINDS = ("cancel", "move", "extra")


def effective_slot(schedule, day_name, group_id, exceptions):
    """A group's class on one date after one-off changes.

    ``exceptions`` are the changes for that date only: dicts with group_id (None = every
    group), kind, from_time, to_time. Returns {"from", "to"} or None when there is no class.
    """
    if any(x["group_id"] is None for x in exceptions):
        return None                                   # holiday
    mine = [x for x in exceptions if x["group_id"] == group_id]
    if any(x["kind"] == "cancel" for x in mine):
        return None
    moved = next((x for x in mine if x["kind"] in ("move", "extra") and x.get("from_time")), None)
    if moved:
        return {"from": moved["from_time"], "to": moved.get("to_time") or ""}
    e = next((x for x in (schedule or []) if x.get("day") == day_name and (x.get("from") or "").strip()), None)
    return {"from": e["from"], "to": e.get("to") or ""} if e else None


def change_notes(schedule, group_id, exceptions, start, days=7):
    """Lines describing one group's one-off changes from ``start`` for ``days`` days.

    Mirrors withChangeNotes() in static/js/exceptions.js. A day off or a cancellation is only
    mentioned when the group usually has a class that day.
    """
    lines = []
    for i in range(days):
        d = start + timedelta(days=i)
        key, day = d.isoformat(), DAYS[d.weekday()]
        todays = [x for x in exceptions if x["date"] == key]
        mine = [x for x in todays if x["group_id"] == group_id]
        usual = any(e.get("day") == day and (e.get("from") or "").strip() for e in schedule or [])
        when = f"{d:%a} {d.day} {d:%b}"
        if any(x["group_id"] is None for x in todays):
            if usual:
                lines.append(f"* {when}: no class (day off)")
            continue
        if any(x["kind"] == "cancel" for x in mine):
            if usual:
                lines.append(f"* {when}: class cancelled")
            continue
        moved = next((x for x in mine if x["kind"] in ("move", "extra") and x.get("from_time")), None)
        if moved:
            time = moved["from_time"] + (f" - {moved['to_time']}" if moved.get("to_time") else "")
            lines.append(f"* {when}: {'extra class' if moved['kind'] == 'extra' else 'moved to'} {time}")
    return lines


def add_change_notes(message, lines):
    """Put the lines under "*Changes this week:*", before the closing "*Kindly Acknowledge*"."""
    if not lines or not message:
        return message
    out, block = message.split("\n"), ["*Changes this week:*", *lines]
    if out[-1] == "*Kindly Acknowledge*":
        out[-1:-1] = block
    else:
        out += block
    return "\n".join(out)


def _minutes(s):
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$", str(s or "").strip().lower())
    if not m:
        return None
    h, mins, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if h > 23 or mins > 59:
        return None
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return h * 60 + mins


def feed_token(secret, user_id):
    """Unguessable, storage-free token for a user's calendar link."""
    return hmac.new(str(secret).encode(), str(user_id).encode(), hashlib.sha256).hexdigest()[:32]


def _text(s):
    return str(s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line):
    """iCalendar lines are at most 75 octets; longer ones continue on a line starting with a space."""
    out, raw = [], line.encode("utf-8")
    while len(raw) > 75:
        cut = 75
        while cut > 0 and (raw[cut] & 0xC0) == 0x80:   # never split a multi-byte character
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = b" " + raw[cut:]
    out.append(raw.decode("utf-8"))
    return out


def _where(slot):
    """LOCATION / DESCRIPTION lines for a slot's optional room and teacher."""
    out = []
    if str(slot.get("room") or "").strip():
        out.append(f"LOCATION:{_text(str(slot['room']).strip())}")
    if str(slot.get("teacher") or "").strip():
        out.append(f"DESCRIPTION:{_text('Teacher: ' + str(slot['teacher']).strip())}")
    return out


def build_ics(groups, exceptions, today, name="Class schedule", now=None):
    """Weekly timetable as an iCalendar feed.

    groups: [{"id", "name", "schedule": [{"day", "from", "to", "room"?, "teacher"?}]}]
    exceptions: [{"group_id", "date": "YYYY-MM-DD", "kind", "from_time", "to_time"}]
    Times are written without a timezone ("floating"), i.e. the same wall-clock time the
    timetable shows. Cancelled, moved and holiday dates are excluded from the weekly repeat;
    moved and extra classes are added as single events. A slot's room becomes the event's
    LOCATION and its teacher the DESCRIPTION; a moved class keeps that day's room and teacher.
    """
    stamp = (now or datetime.utcnow()).strftime("%Y%m%dT%H%M%SZ")
    monday = today - timedelta(days=today.weekday())
    fmt = "%Y%m%dT%H%M%S"
    holidays = {x["date"] for x in exceptions if x["group_id"] is None}
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SSIES//Schedule Sender//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:{_text(name)}"]

    def event(uid, start_dt, minutes, summary, extra=()):
        lines.extend(["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}", f"DTSTART:{start_dt.strftime(fmt)}",
                      f"DTEND:{(start_dt + timedelta(minutes=minutes)).strftime(fmt)}", f"SUMMARY:{_text(summary)}"])
        lines.extend(extra)
        lines.append("END:VEVENT")

    for g in groups:
        mine = [x for x in exceptions if x["group_id"] == g["id"]]
        for e in g.get("schedule") or []:
            start, end = _minutes(e.get("from")), _minutes(e.get("to"))
            if start is None or e.get("day") not in DAYS:
                continue
            length = end - start if end is not None and end > start else 60
            di = DAYS.index(e["day"])
            first = datetime.combine(monday + timedelta(days=di), datetime.min.time()) + timedelta(minutes=start)
            skip = sorted(d for d in holidays | {x["date"] for x in mine if x["kind"] in ("cancel", "move")}
                          if datetime.strptime(d, "%Y-%m-%d").weekday() == di)
            extra = ["RRULE:FREQ=WEEKLY"] + [
                f"EXDATE:{(datetime.strptime(d, '%Y-%m-%d') + timedelta(minutes=start)).strftime(fmt)}" for d in skip]
            event(f"g{g['id']}-{di}@ssies-schedule", first, length, g["name"], extra + _where(e))
        for x in mine:
            start = _minutes(x.get("from_time"))
            if x["kind"] not in ("move", "extra") or start is None or x["date"] in holidays:
                continue
            end = _minutes(x.get("to_time"))
            length = end - start if end is not None and end > start else 60
            when = datetime.strptime(x["date"], "%Y-%m-%d") + timedelta(minutes=start)
            usual = next((e for e in g.get("schedule") or [] if e.get("day") == DAYS[when.weekday()]), {})
            event(f"g{g['id']}-x{x['date']}@ssies-schedule", when, length, g["name"], _where(usual))
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"
