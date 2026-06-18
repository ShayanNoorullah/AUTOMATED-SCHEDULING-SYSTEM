import json
import uuid

from app.auth.decorators import get_supabase_admin
from app.config import Config
from app.models import Profile, Group, Contact, Template, db
from app.services.audit import audit


def profile_dict(p, include_stats=False):
    d = {
        "id": str(p.id),
        "email": p.email,
        "displayName": p.display_name or "",
        "role": p.role,
        "isActive": p.is_active,
        "headless": p.headless,
        "delaySeconds": p.delay_seconds,
        "createdAt": p.created_at.isoformat(timespec="seconds") if p.created_at else None,
        "lastLoginAt": p.last_login_at.isoformat(timespec="seconds") if p.last_login_at else None,
    }
    if include_stats:
        uid = p.id
        d["groupCount"] = Group.query.filter_by(user_id=uid).count()
        d["contactCount"] = Contact.query.filter_by(user_id=uid).count()
        d["templateCount"] = Template.query.filter_by(user_id=uid).count()
    return d


def can_admin_manage(actor, target):
    if actor.is_superadmin():
        return True
    if actor.role == "admin" and target.role == "user":
        return True
    return False


def create_user(email, password, display_name="", role="user", actor_id=None):
    email = email.strip().lower()
    if role == "superadmin":
        raise ValueError("Cannot create superadmin via API")
    if Profile.query.filter_by(email=email).first():
        raise ValueError("Email already registered")

    sb = get_supabase_admin()
    resp = sb.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"display_name": display_name},
    })
    user = resp.user
    uid = uuid.UUID(user.id)

    profile = Profile(
        id=uid,
        email=email,
        display_name=display_name or email.split("@")[0],
        role=role,
        is_active=True,
    )
    db.session.add(profile)
    db.session.flush()
    from app.services.template_seed import seed_default_template_for_user
    seed_default_template_for_user(uid)
    db.session.commit()
    audit("user_created", f"email={email} role={role}", actor_id=actor_id, target_id=uid)
    return profile


def update_user_profile(target, data, actor):
    if not can_admin_manage(actor, target) and actor.id != target.id:
        raise PermissionError("Forbidden")

    if actor.role == "admin" and target.role != "user" and actor.id != target.id:
        raise PermissionError("Admins can only manage users")

    if "displayName" in data:
        target.display_name = (data["displayName"] or "").strip()[:255]
    if "headless" in data and (actor.id == target.id or actor.is_admin()):
        target.headless = bool(data["headless"])
    if "delaySeconds" in data and (actor.id == target.id or actor.is_admin()):
        try:
            target.delay_seconds = max(0, min(300, int(data["delaySeconds"])))
        except (TypeError, ValueError):
            pass
    if "isActive" in data and actor.is_admin() and actor.id != target.id:
        if actor.role == "admin" and target.role != "user":
            raise PermissionError("Cannot disable non-user accounts")
        target.is_active = bool(data["isActive"])
        if not target.is_active:
            try:
                sb = get_supabase_admin()
                sb.auth.admin.sign_out(str(target.id))
            except Exception:
                pass

    if "role" in data and actor.is_superadmin() and actor.id != target.id:
        new_role = data["role"]
        if new_role == "superadmin":
            raise ValueError("Cannot assign superadmin role")
        if target.role == "superadmin":
            raise ValueError("Cannot change superadmin role")
        target.role = new_role

    db.session.commit()
    audit("user_updated", f"email={target.email}", actor_id=actor.id, target_id=target.id)
    return target


def delete_user(target, actor):
    if not can_admin_manage(actor, target):
        raise PermissionError("Forbidden")
    if actor.role == "admin" and target.role != "user":
        raise PermissionError("Admins can only delete users")
    if target.role == "superadmin":
        raise ValueError("Cannot delete superadmin")
    if actor.id == target.id:
        raise ValueError("Cannot delete yourself")

    email = target.email
    uid = str(target.id)
    sb = get_supabase_admin()
    sb.auth.admin.delete_user(uid)
    db.session.delete(target)
    db.session.commit()
    audit("user_deleted", f"email={email}", actor_id=actor.id, target_id=uuid.UUID(uid))


def send_password_reset(email):
    sb = get_supabase_admin()
    sb.auth.reset_password_email(email)


def get_system_setting(key, default=None):
    from app.models import SystemSetting
    row = db.session.get(SystemSetting, key)
    if not row:
        return default
    val = row.value
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return val
    return val


def set_system_setting(key, value):
    from app.models import SystemSetting
    from datetime import datetime
    row = db.session.get(SystemSetting, key)
    if not row:
        row = SystemSetting(key=key, value=value)
        db.session.add(row)
    else:
        row.value = value
        row.updated_at = datetime.utcnow()
    db.session.commit()
    return value


def maintenance_mode():
    return bool(get_system_setting("maintenance_mode", False))
