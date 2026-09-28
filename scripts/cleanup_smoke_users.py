"""Delete leftover smoke.*@example.com profiles + auth users."""
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def load_run_local():
    path = ROOT / "run.local.bat"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.lower().startswith("set ") or "=" not in s:
            continue
        body = s[4:]
        key, _, val = body.partition("=")
        key, val = key.strip(), val.strip().strip('"')
        if key and key not in os.environ:
            os.environ[key] = val

load_run_local()
from app import create_app
from app.models import Profile, db
from app.services.users import delete_user

app = create_app()
with app.app_context():
    actor = Profile.query.filter_by(role="superadmin").first()
    rows = Profile.query.filter(Profile.email.like("smoke.%@example.com")).all()
    print(f"Found {len(rows)} smoke profiles")
    for p in rows:
        try:
            if actor:
                delete_user(p, actor)
            else:
                from app.auth.decorators import get_supabase_admin
                from app.models import Group, Contact, Template, ReleaseLog, ScheduledJob, Notification, PasswordRequest, WebAuthnCredential, AuditLog
                Group.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                Contact.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                Template.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                ReleaseLog.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                ScheduledJob.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                Notification.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                WebAuthnCredential.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                PasswordRequest.query.filter_by(user_id=p.id).delete(synchronize_session=False)
                get_supabase_admin().auth.admin.delete_user(str(p.id))
                db.session.delete(p)
                db.session.commit()
            print("deleted", p.email)
        except Exception as e:
            db.session.rollback()
            print("FAIL", p.email, e)
