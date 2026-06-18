from flask import request

from app.models import AuditLog, db


def client_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()


def audit(action, detail="", actor_id=None, target_id=None):
    try:
        db.session.add(AuditLog(
            actor_id=actor_id,
            target_id=target_id,
            action=action,
            detail=(detail or "")[:400],
            ip=client_ip(),
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
