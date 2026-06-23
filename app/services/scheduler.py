"""Background scheduler for weekly automated sends."""
from __future__ import annotations

import json
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

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


def start_scheduler(app):
    if scheduler.running:
        return
    scheduler.add_job(tick, "interval", minutes=1, args=[app], id="ssies_scheduled_send", replace_existing=True)
    scheduler.start()
    log.info("Scheduled send checker started (every 1 min)")
