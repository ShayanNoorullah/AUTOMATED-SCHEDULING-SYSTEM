"""Background scheduler for weekly automated sends."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import DAYS
from app.models import Group, Profile, ReminderLog, ScheduledJob, ScheduledMessage, ScheduleException, db
from app.services.users import maintenance_mode
from app.services.whatsapp import format_message, run_release
from app.crypto import dec

log = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def _dow_sunday0(dt: datetime) -> int:
    """Sunday=0 … Saturday=6."""
    return (dt.weekday() + 1) % 7


def parse_schedule(cron_expr: str) -> dict | None:
    try:
        cfg = json.loads(cron_expr or "{}")
        if not isinstance(cfg, dict):
            return None
        return {
            "dow": int(cfg.get("dow", 0)),
            "hour": int(cfg.get("hour", 9)),
            "minute": int(cfg.get("minute", 0)),
        }
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def schedule_to_cron(dow: int, hour: int, minute: int) -> str:
    return json.dumps({"dow": int(dow), "hour": int(hour), "minute": int(minute)})


def job_due(job: ScheduledJob, now: datetime) -> bool:
    if not job.enabled:
        return False
    cfg = parse_schedule(job.cron_expr)
    if not cfg:
        return False
    if _dow_sunday0(now) != cfg["dow"]:
        return False
    if now.hour != cfg["hour"] or now.minute != cfg["minute"]:
        return False
    if job.last_run_at and job.last_run_at.date() == now.date():
        return False
    return True


def _targets_for_user(user_id):
    from app.services.schedule_extras import add_change_notes, change_notes
    rows = Group.query.filter_by(user_id=user_id).order_by(Group.position).all()
    start = (datetime.utcnow() + timedelta(minutes=_reminder_cfg()["tz"])).date()   # the user's "today"
    changes = [{"group_id": x.group_id, "date": x.date, "kind": x.kind, "from_time": x.from_time, "to_time": x.to_time}
               for x in ScheduleException.query.filter_by(user_id=user_id).all()]
    targets = []
    for g in rows:
        # a custom message is the user's own words; only the automatic one gets this week's changes
        msg = dec(g.message_enc) or add_change_notes(format_message(g.schedule), change_notes(g.schedule, g.id, changes, start))
        if msg.strip():
            targets.append({"name": g.name, "message": msg})
    return targets


def run_scheduled_job(app, job: ScheduledJob):
    with app.app_context():
        profile = db.session.get(Profile, job.user_id)
        if not profile or not profile.is_active:
            return
        if maintenance_mode() and not profile.is_admin():
            log.info("Skip scheduled job %s — maintenance mode", job.id)
            return
        targets = _targets_for_user(job.user_id)
        if not targets:
            log.info("Skip scheduled job %s — no targets", job.id)
            return
        ok, err = run_release(
            app, job.user_id, profile.headless, profile.delay_seconds, targets, job.user_id
        )
        job.last_run_at = datetime.utcnow()
        db.session.commit()
        if ok:
            log.info("Scheduled job %s started release for user %s", job.id, job.user_id)
        else:
            log.warning("Scheduled job %s failed: %s", job.id, err)


SCHEDULED_MSG_GRACE_MIN = 30   # a one-time send blocked by a busy account keeps trying this long


def run_scheduled_message(app, m: ScheduledMessage, now: datetime):
    """Start one due one-time send. Leaves it pending when another send is busy, until the grace runs out."""
    profile = db.session.get(Profile, m.user_id)
    late = now - m.send_at > timedelta(minutes=SCHEDULED_MSG_GRACE_MIN)
    if not profile or not profile.is_active:
        ok, err = False, "Account inactive"
    elif maintenance_mode() and not profile.is_admin():
        ok, err = False, "Maintenance mode"
    else:
        try:
            targets = json.loads(dec(m.targets_enc) or "[]")
        except (TypeError, ValueError):
            targets = []
        ok, err = run_release(app, m.user_id, profile.headless, profile.delay_seconds, targets, m.user_id)
    if not ok and not late and err and ("in progress" in err or err == "Maintenance mode"):
        return                                    # try again next minute
    m.status, m.detail = ("sent", "") if ok else ("failed", (err or "")[:200])
    db.session.commit()
    log.info("Scheduled message %s: %s %s", m.id, m.status, m.detail)


def tick(app):
    with app.app_context():
        now = datetime.utcnow()
        for job in ScheduledJob.query.filter_by(enabled=True).all():
            if job_due(job, now):
                run_scheduled_job(app, job)
        for m in ScheduledMessage.query.filter(ScheduledMessage.status == "pending", ScheduledMessage.send_at <= now).all():
            run_scheduled_message(app, m, now)


# ── Class reminders ──────────────────────────────────────────────────────────
# Fire a WhatsApp reminder to a group a set time before each class in its
# schedule. Class times are the user's local wall-clock; the server runs UTC,
# so a timezone offset (default +300 min = PKT) converts them. Each occurrence
# is recorded in reminder_log before sending, so it fires once even if the app
# restarts; a reminder missed by up to REMINDER_GRACE_MIN (a restart or a slow
# tick) is still sent.
_DEFAULT_REMINDER = "⏰ Reminder: *{group}* class starts at {time} (in {lead} min)."
REMINDER_GRACE_MIN = 5
_pruned_day = ""


def claim_reminder(key):
    """Record a reminder as sent. False when it was already recorded."""
    if db.session.get(ReminderLog, key):
        return False
    db.session.add(ReminderLog(key=key))
    db.session.commit()
    return True


def _parse_time_min(s):
    if not s:
        return None
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$", str(s).strip().lower())
    if not m:
        return None
    h = int(m.group(1)); mn = int(m.group(2) or 0); ap = m.group(3)
    if h > 23 or mn > 59:
        return None
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return h * 60 + mn


def _reminder_cfg():
    from app.services.users import get_system_setting
    def _int(key, default):
        try:
            return int(get_system_setting(key, default) or default)
        except (TypeError, ValueError):
            return default
    return {
        "enabled": bool(get_system_setting("reminders_enabled", False)),
        "lead": max(0, _int("reminder_lead_min", 60)),
        "tz": _int("reminder_tz_offset_min", 300),
        "template": get_system_setting("reminder_template", "") or _DEFAULT_REMINDER,
    }


def build_reminder(template, group_name, time_str, lead):
    return (template or _DEFAULT_REMINDER).replace("{group}", group_name).replace("{time}", time_str).replace("{lead}", str(lead))


def send_group_reminder(user_id, group_name, message):
    from app.services.whatsapp_provider import get_provider, send_target
    provider = get_provider()
    if provider == "direct_only":
        return False, "disabled"
    try:
        ok = send_target(group_name, message, provider=provider, user_id=user_id)
        return bool(ok), None
    except Exception as e:  # noqa: BLE001 - never let one reminder break the tick
        return False, str(e)


def reminder_tick(app):
    with app.app_context():
        cfg = _reminder_cfg()
        if not cfg["enabled"]:
            return
        now = datetime.utcnow()
        local = now + timedelta(minutes=cfg["tz"])
        today = DAYS[local.weekday()]              # DAYS[0] == Monday, weekday() Mon==0
        now_min = local.hour * 60 + local.minute
        stamp = local.date().isoformat()
        global _pruned_day
        if _pruned_day != stamp:            # once a day: forget reminders older than two days
            _pruned_day = stamp
            ReminderLog.query.filter(ReminderLog.created_at < now - timedelta(days=2)).delete()
            db.session.commit()
        from app.services.schedule_extras import effective_slot
        for prof in Profile.query.filter_by(is_active=True).all():
            if getattr(prof, "waha_slot", None) is None:
                continue                            # only users with WhatsApp linked
            changes = [{"group_id": x.group_id, "kind": x.kind, "from_time": x.from_time, "to_time": x.to_time}
                       for x in ScheduleException.query.filter_by(user_id=prof.id, date=stamp).all()]
            for g in Group.query.filter_by(user_id=prof.id).all():
                e = effective_slot(g.schedule, today, g.id, changes)   # None: no class today (or cancelled / holiday)
                if not e:
                    continue
                start = _parse_time_min(e["from"])
                if start is None:
                    continue
                late = now_min - (start - cfg["lead"])
                if start - cfg["lead"] < 0 or not 0 <= late <= REMINDER_GRACE_MIN:
                    continue
                if not claim_reminder(f"{prof.id}|{g.id}|{stamp}|{e['from']}"):
                    continue
                msg = build_reminder(cfg["template"], g.name, e["from"], cfg["lead"])
                ok, err = send_group_reminder(prof.id, g.name, msg)
                log.info("Reminder %s for %s/%s: %s", "sent" if ok else "failed", prof.id, g.name, err or "")


def start_scheduler(app):
    if scheduler.running:
        return
    scheduler.add_job(tick, "interval", minutes=1, args=[app], id="ssies_scheduled_send", replace_existing=True)
    scheduler.add_job(reminder_tick, "interval", minutes=1, args=[app], id="ssies_class_reminders", replace_existing=True)
    scheduler.start()
    log.info("Scheduled send + reminder checkers started (every 1 min)")
