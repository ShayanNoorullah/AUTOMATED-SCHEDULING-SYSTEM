import csv
import io
import uuid
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, render_template, request, Response

from app.auth.decorators import superadmin_required
from app.models import Profile, AuditLog, ReleaseLog, Group, Contact, Template, db
from app.services.users import (
    profile_dict, create_user, update_user_profile, delete_user,
    send_password_reset, get_system_setting, set_system_setting,
)
from app.services.audit import audit

bp = Blueprint("superadmin", __name__, url_prefix="/superadmin")


def _uid(s):
    try:
        return uuid.UUID(str(s))
    except (ValueError, TypeError):
        return None


@bp.route("/")
@superadmin_required
def dashboard():
    total_users = Profile.query.filter_by(role="user").count()
    total_admins = Profile.query.filter_by(role="admin").count()
    active = Profile.query.filter_by(is_active=True).count()
    disabled = Profile.query.filter(Profile.is_active == False).count()
    today = datetime.utcnow().date()
    releases_today = ReleaseLog.query.filter(
        ReleaseLog.created_at >= datetime.combine(today, datetime.min.time())
    ).count()
    recent_audit = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(10).all()
    return render_template(
        "superadmin/dashboard.html",
        profile=g.profile,
        total_users=total_users,
        total_admins=total_admins,
        active=active,
        disabled=disabled,
        releases_today=releases_today,
        recent_audit=recent_audit,
        site_name=get_system_setting("site_name", "SSIES Schedule Sender"),
    )


@bp.route("/users")
@superadmin_required
def users_page():
    return render_template("superadmin/users.html", profile=g.profile)


@bp.route("/admins")
@superadmin_required
def admins_page():
    return render_template("superadmin/admins.html", profile=g.profile)


@bp.route("/roles")
@superadmin_required
def roles_page():
    return render_template("superadmin/roles.html", profile=g.profile)


@bp.route("/settings")
@superadmin_required
def settings_page():
    return render_template(
        "superadmin/settings.html",
        profile=g.profile,
        maintenance_mode=get_system_setting("maintenance_mode", False),
        site_name=get_system_setting("site_name", "SSIES Schedule Sender"),
        default_delay=get_system_setting("default_delay_seconds", 5),
        allow_user_creation=get_system_setting("allow_user_creation", True),
        wa_provider=get_system_setting("wa_provider", "selenium"),
        waha_base_url=get_system_setting("waha_base_url", "http://localhost:3000"),
        waha_api_key=get_system_setting("waha_api_key", ""),
        waha_session_name=get_system_setting("waha_session_name", "default"),
        max_users=get_system_setting("max_users", 0),
    )


@bp.route("/audit")
@superadmin_required
def audit_page():
    return render_template("superadmin/audit.html", profile=g.profile)


@bp.route("/inspect/<user_id>")
@superadmin_required
def inspect_user(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return "Not found", 404
    return render_template("superadmin/inspect.html", profile=g.profile, target=target)


@bp.route("/profile")
@superadmin_required
def super_profile():
    return render_template("user/profile.html", profile=g.profile, back_url="/superadmin")


@bp.route("/api/users", methods=["GET"])
@superadmin_required
def list_all_users():
    role = request.args.get("role")
    q = Profile.query
    if role:
        q = q.filter_by(role=role)
    users = q.order_by(Profile.created_at.desc()).all()
    return jsonify([profile_dict(u, include_stats=True) for u in users])


@bp.route("/api/admins", methods=["GET"])
@superadmin_required
def list_admins():
    admins = Profile.query.filter_by(role="admin").order_by(Profile.created_at.desc()).all()
    return jsonify([profile_dict(a, include_stats=True) for a in admins])


@bp.route("/api/admins", methods=["POST"])
@superadmin_required
def create_admin():
    data = request.json or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    display_name = (data.get("displayName") or "").strip()
    if not email or len(password) < 8:
        return jsonify({"error": "Valid email and password required"}), 400
    try:
        user = create_user(email, password, display_name, role="admin", actor_id=g.profile.id)
        return jsonify({"ok": True, "user": profile_dict(user)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/users/<user_id>/role", methods=["PUT"])
@superadmin_required
def change_role(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    if target.role == "superadmin":
        return jsonify({"error": "Cannot change superadmin role"}), 403
    new_role = (request.json or {}).get("role")
    if new_role not in ("user", "admin"):
        return jsonify({"error": "Invalid role"}), 400
    try:
        update_user_profile(target, {"role": new_role}, g.profile)
        audit("role_changed", f"email={target.email} role={new_role}", actor_id=g.profile.id, target_id=target.id)
        return jsonify({"ok": True})
    except (PermissionError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/users/<user_id>", methods=["GET"])
@superadmin_required
def get_user(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    return jsonify(profile_dict(target, include_stats=True))


@bp.route("/api/users/<user_id>", methods=["PUT"])
@superadmin_required
def update_user(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    try:
        update_user_profile(target, request.json or {}, g.profile)
        return jsonify({"ok": True, "user": profile_dict(target, include_stats=True)})
    except (PermissionError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/users/<user_id>", methods=["DELETE"])
@superadmin_required
def delete_user_route(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    try:
        delete_user(target, g.profile)
        return jsonify({"ok": True})
    except (PermissionError, ValueError) as e:
        return jsonify({"error": str(e)}), 403


@bp.route("/api/users/<user_id>/reset-password", methods=["POST"])
@superadmin_required
def reset_pw(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    send_password_reset(target.email)
    audit("password_reset_sent", f"email={target.email}", actor_id=g.profile.id, target_id=target.id)
    return jsonify({"ok": True})


@bp.route("/api/settings", methods=["GET"])
@superadmin_required
def get_settings():
    return jsonify({
        "maintenanceMode": get_system_setting("maintenance_mode", False),
        "siteName": get_system_setting("site_name", "SSIES Schedule Sender"),
        "defaultDelaySeconds": get_system_setting("default_delay_seconds", 5),
        "allowUserCreation": get_system_setting("allow_user_creation", True),
        "waProvider": get_system_setting("wa_provider", "selenium"),
        "wahaBaseUrl": get_system_setting("waha_base_url", "http://localhost:3000"),
        "wahaApiKey": get_system_setting("waha_api_key", ""),
        "wahaSessionName": get_system_setting("waha_session_name", "default"),
        "maxUsers": get_system_setting("max_users", 0),
    })


@bp.route("/api/settings", methods=["PUT"])
@superadmin_required
def update_settings():
    data = request.json or {}
    if "maintenanceMode" in data:
        set_system_setting("maintenance_mode", bool(data["maintenanceMode"]))
    if "siteName" in data:
        set_system_setting("site_name", str(data["siteName"])[:100])
    if "defaultDelaySeconds" in data:
        set_system_setting("default_delay_seconds", int(data["defaultDelaySeconds"]))
    if "allowUserCreation" in data:
        set_system_setting("allow_user_creation", bool(data["allowUserCreation"]))
    if "waProvider" in data:
        v = str(data["waProvider"])
        if v in ("waha", "selenium", "direct_only"):
            set_system_setting("wa_provider", v)
    if "wahaBaseUrl" in data:
        set_system_setting("waha_base_url", str(data["wahaBaseUrl"]).strip()[:255])
    if "wahaApiKey" in data:
        set_system_setting("waha_api_key", str(data["wahaApiKey"])[:255])
    if "wahaSessionName" in data:
        set_system_setting("waha_session_name", str(data["wahaSessionName"]).strip()[:64] or "default")
    if "maxUsers" in data:
        set_system_setting("max_users", max(0, int(data["maxUsers"])))
    audit("settings_updated", str(list(data.keys()))[:200], actor_id=g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/waha/health", methods=["GET"])
@superadmin_required
def waha_health():
    from app.services.waha_client import health
    return jsonify(health())


@bp.route("/api/audit", methods=["GET"])
@superadmin_required
def global_audit():
    q = AuditLog.query
    action = request.args.get("action")
    actor = request.args.get("actor")
    if action:
        q = q.filter(AuditLog.action == action)
    if actor:
        q = q.filter(AuditLog.actor_id == actor)
    rows = q.order_by(AuditLog.created_at.desc()).limit(500).all()
    actor_ids = {r.actor_id for r in rows if r.actor_id}
    emails = {}
    if actor_ids:
        for p in Profile.query.filter(Profile.id.in_(actor_ids)).all():
            emails[p.id] = p.email
    return jsonify([{
        "action": r.action,
        "detail": r.detail,
        "actorId": str(r.actor_id) if r.actor_id else None,
        "actorEmail": emails.get(r.actor_id),
        "targetId": str(r.target_id) if r.target_id else None,
        "ip": r.ip,
        "at": r.created_at.isoformat(timespec="seconds"),
    } for r in rows])


@bp.route("/api/audit/export")
@superadmin_required
def export_audit():
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(5000).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["at", "action", "detail", "actor_id", "target_id", "ip"])
    for r in rows:
        writer.writerow([
            r.created_at.isoformat() if r.created_at else "",
            r.action, r.detail,
            str(r.actor_id) if r.actor_id else "",
            str(r.target_id) if r.target_id else "",
            r.ip or "",
        ])
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


@bp.route("/api/stats", methods=["GET"])
@superadmin_required
def stats():
    return jsonify({
        "users": Profile.query.filter_by(role="user").count(),
        "admins": Profile.query.filter_by(role="admin").count(),
        "active": Profile.query.filter_by(is_active=True).count(),
        "disabled": Profile.query.filter_by(is_active=False).count(),
        "groups": Group.query.count(),
        "contacts": Contact.query.count(),
        "releasesToday": ReleaseLog.query.filter(
            ReleaseLog.created_at >= datetime.utcnow() - timedelta(days=1)
        ).count(),
    })
