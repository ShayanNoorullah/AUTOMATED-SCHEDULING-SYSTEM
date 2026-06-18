import queue
import threading
import time
from datetime import datetime

from app.crypto import dec, enc
from app.models import Group, Contact, ReleaseLog, db
from app.services.audit import audit

status_queue = queue.Queue()
release_lock = threading.Lock()


def fmt_time(e):
    f, t = (e.get("from", "") or "").strip(), (e.get("to", "") or "").strip()
    if f and t:
        return f"{f} - {t}"
    if f:
        return f
    return e.get("time", "")


def format_message(schedule):
    lines = ["*Note*", "Schedule for this week:", ""]
    for e in schedule or []:
        lines.append(f"* {e['day']}: {fmt_time(e)}")
    lines.append("*Kindly Acknowledge*")
    return "\n".join(lines)


def group_dict(g):
    return {
        "name": g.name,
        "schedule": g.schedule or [],
        "message": dec(g.message_enc),
        "lastReleased": g.last_released or "",
        "inviteLink": getattr(g, "invite_link", None) or "",
    }


def template_dict(t):
    return {"name": t.name, "content": dec(t.content_enc)}


def contact_dict(c):
    return {
        "name": c.name,
        "phone": dec(c.phone_enc),
        "message": dec(c.message_enc),
        "lastReleased": c.last_released or "",
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

    provider = get_provider()
    if provider == "direct_only":
        return False, "Automated send is disabled in system settings"

    ok_conn, conn_err = require_connected()
    if not ok_conn:
        return False, conn_err

    if not release_lock.acquire(blocking=False):
        return False, "Release already in progress"

    targets = [t for t in targets if t.get("name") and (t.get("message", "") or "").strip()]
    if not targets:
        release_lock.release()
        return False, "Nothing to send"

    audit("release", f"{len(targets)} recipient(s)", actor_id=actor_id or user_id, target_id=user_id)

    def log(msg):
        status_queue.put(msg)

    def worker():
        try:
            with app.app_context():
                mode = f" ({provider})" + (" headless" if headless and provider == "selenium" else "")
                log(f"info:── Releasing to {len(targets)} recipient(s){mode} ──")
                ok = 0
                for i, t in enumerate(targets):
                    phone = t.get("phone")
                    try:
                        success = send_target(
                            t["name"], t["message"],
                            headless=headless, phone=phone, log=log, provider=provider,
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
                    if delay and i < len(targets) - 1:
                        log(f"info:Waiting {delay}s before next recipient…")
                        time.sleep(delay)
                log(f"done:── Finished: {ok}/{len(targets)} sent ──")
        except Exception as e:
            log(f"error:Release failed: {e}")
        finally:
            release_lock.release()

    threading.Thread(target=worker, daemon=True).start()
    return True, None
