"""Background scheduler for weekly automated sends."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import DAYS
from app.models import Group, Profile, ScheduledJob, db
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
    rows = Group.query.filter_by(user_id=user_id).order_by(Group.position).all()
    targets = []
    for g in rows:
        msg = dec(g.message_enc) or format_message(g.schedule)
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


def tick(app):
    with app.app_context():
        now = datetime.utcnow()
        for job in ScheduledJob.query.filter_by(enabled=True).all():
            if job_due(job, now):
                run_scheduled_job(app, job)


# ── Class reminders ──────────────────────────────────────────────────────────
# Fire a WhatsApp reminder to a group a set time before each class in its
# schedule. Class times are the user's local wall-clock; the server runs UTC,
# so a timezone offset (default +300 min = PKT) converts them. Dedup is in
# memory (resets on restart) — keyed per occurrence so each fires once a day.
_DEFAULT_REMINDER = "⏰ Reminder: *{group}* class starts at {time} (in {lead} min)."
_reminded: set[str] = set()
_reminded_day = ""


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
        global _reminded_day
        if _reminded_day != stamp:          # new local day → forget yesterday's sends
            _reminded.clear(); _reminded_day = stamp
        for prof in Profile.query.filter_by(is_active=True).all():
            if getattr(prof, "waha_slot", None) is None:
                continue                            # only users with WhatsApp linked
            for g in Group.query.filter_by(user_id=prof.id).all():
                e = next((x for x in (g.schedule or []) if x.get("day") == today and (x.get("from") or "").strip()), None)
                if not e:
                    continue
                start = _parse_time_min(e["from"])
                if start is None:
                    continue
                remind_at = start - cfg["lead"]
                if remind_at < 0 or remind_at != now_min:
                    continue
                key = f"{prof.id}|{g.id}|{stamp}|{e['from']}"
                if key in _reminded:
                    continue
                _reminded.add(key)
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
