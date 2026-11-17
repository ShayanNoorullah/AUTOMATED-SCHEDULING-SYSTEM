import queue
import threading
import time
from datetime import datetime

from app.crypto import dec, enc
from app.models import Group, Contact, ReleaseLog, db
from app.services.audit import audit

status_queue = queue.Queue()


def fmt_time(e):
    f, t = (e.get("from", "") or "").strip(), (e.get("to", "") or "").strip()
    if f and t:
        return f"{f} - {t}"
    if f:
        return f
    return e.get("time", "")


def format_message(schedule):
    lines = ["*Note*", "Schedule for this week:"]
    for e in schedule or []:
        lines.append(f"* {e['day']}: {fmt_time(e)}")
    lines.append("*Kindly Acknowledge*")
    return "\n".join(lines)


def group_dict(g):
    return {
        "name": g.name,
        "nickname": getattr(g, "nickname", None) or "",
        "schedule": g.schedule or [],
        "message": dec(g.message_enc),
        "lastReleased": g.last_released or "",
        "inviteLink": getattr(g, "invite_link", None) or "",
    }


def template_dict(t):
    return {"name": t.name, "content": dec(t.content_enc)}


def contact_dict(c):
    labels = getattr(c, "labels", None) or []
    if not isinstance(labels, list):
        labels = []
    return {
        "name": c.name,
        "phone": dec(c.phone_enc),
        "message": dec(c.message_enc),
        "lastReleased": c.last_released or "",
        "labels": [str(x) for x in labels if str(x).strip()],
    }


def digits(s):
    return "".join(ch for ch in str(s or "") if ch.isdigit())


def stamp_release(user_id, name, phone=None, success=True, target_type="group"):
    stamp = datetime.now().isoformat(timespec="seconds")
    for g in Group.query.filter_by(user_id=user_id, name=name).all():
        g.last_released = stamp
    if phone:
        for c in Contact.query.filter_by(user_id=user_id).all():
            if dec(c.phone_enc) == phone:
                c.last_released = stamp
    db.session.add(ReleaseLog(
        user_id=user_id,
        target_name=name,
        target_type=target_type,
        status="success" if success else "failed",
    ))
    db.session.commit()


def run_release(app, user_id, headless, delay, targets, actor_id=None):
    from app.services.whatsapp_provider import get_provider, require_connected, send_target
    from app.services.waha_client import use_waha_user

    provider = get_provider()
    if provider == "direct_only":
        return False, "Automated send is disabled in system settings"

    ok_conn, conn_err = require_connected(user_id=user_id)
    if not ok_conn:
        return False, conn_err

    lock = _user_release_lock(user_id)
    if not lock.acquire(blocking=False):
        return False, "Release already in progress for this account"

    targets = [t for t in targets if t.get("name") and (t.get("message", "") or "").strip()]
    if not targets:
        lock.release()
        return False, "Nothing to send"
    stop = _stops[str(user_id)] = threading.Event()

    audit("release", f"{len(targets)} recipient(s)", actor_id=actor_id or user_id, target_id=user_id)

    def log(msg):
        status_queue.put(msg)

    def worker():
        try:
            with app.app_context():
                with use_waha_user(user_id, assign=False):
                    mode = f" ({provider})" + (" headless" if headless and provider == "selenium" else "")
                    log(f"info:── Releasing to {len(targets)} recipient(s){mode} ──")
                    ok = 0
                    for i, t in enumerate(targets):
                        if stop.is_set():
                            break
                        phone = t.get("phone")
                        try:
                            success = send_target(
                                t["name"], t["message"],
                                headless=headless, phone=phone, log=log, provider=provider,
                                user_id=user_id,
                            )
                        except Exception as e:
                            success = False
                            log(f"error:{t['name']}: {e}")
                        if success:
                            ok += 1
                        stamp_release(
                            user_id, t["name"], phone, success=success,
                            target_type="contact" if phone else "group",
                        )
                        if delay and i < len(targets) - 1 and not stop.is_set():
                            log(f"info:Waiting {delay}s before next recipient…")
                            stop.wait(delay)
                    if stop.is_set():
                        log(f"done:── Stopped: {ok}/{len(targets)} sent, the rest skipped ──")
                    else:
                        log(f"done:── Finished: {ok}/{len(targets)} sent ──")
        except Exception as e:
            log(f"error:Release failed: {e}")
        finally:
            lock.release()

    threading.Thread(target=worker, daemon=True).start()
    return True, None


_release_locks = {}
_release_locks_guard = threading.Lock()
_stops = {}   # user id -> Event of that user's current send


def cancel_release(user_id):
    """Stop a send in progress after the message being sent now. False when none is running."""
    stop = _stops.get(str(user_id))
    if not stop or not _user_release_lock(user_id).locked():
        return False
    stop.set()
    return True


def _user_release_lock(user_id):
    key = str(user_id)
    with _release_locks_guard:
        lock = _release_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _release_locks[key] = lock
        return lock


def any_release_busy():
    with _release_locks_guard:
        return any(lock.locked() for lock in _release_locks.values())
