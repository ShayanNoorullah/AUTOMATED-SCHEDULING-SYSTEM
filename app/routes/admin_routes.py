from datetime import datetime, timedelta
import uuid

from flask import Blueprint, g, jsonify, render_template, request

from app.auth.decorators import admin_required, login_required
from app.models import Profile, AuditLog, db
from app.services.users import (
    profile_dict, create_user, update_user_profile, delete_user,
    send_password_reset, get_system_setting,
)

bp = Blueprint("admin", __name__, url_prefix="/admin")


def _uid(s):
    try:
        return uuid.UUID(str(s))
    except (ValueError, TypeError):
        return None


@bp.route("/")
@admin_required
def dashboard():
    users = Profile.query.filter_by(role="user").all()
    active = sum(1 for u in users if u.is_active)
    disabled = len(users) - active
    recent = Profile.query.filter_by(role="user").order_by(Profile.created_at.desc()).limit(5).all()
    return render_template(
        "admin/dashboard.html",
        profile=g.profile,
        total_users=len(users),
        active_users=active,
        disabled_users=disabled,
        recent_users=recent,
    )


@bp.route("/users")
@admin_required
def users_page():
    return render_template("admin/users.html", profile=g.profile)


@bp.route("/users/<user_id>")
@admin_required
def user_detail_page(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target or target.role != "user":
        return "Not found", 404
    return render_template("admin/user_detail.html", profile=g.profile, target=target)


@bp.route("/activity")
@admin_required
def activity_page():
    return render_template("admin/activity.html", profile=g.profile)


@bp.route("/profile")
@admin_required
def admin_profile_page():
    return render_template(
        "user/profile.html",
        profile=g.profile,
        back_url="/admin",
        back_label="Admin portal",
        use_portal=True,
        portal_kind="admin",
        portal_title="Admin",
    )


@bp.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    q = Profile.query.filter_by(role="user")
    if g.profile.role == "admin":
        q = q.filter(Profile.role == "user")
    users = q.order_by(Profile.created_at.desc()).all()
    return jsonify([profile_dict(u, include_stats=True) for u in users])


@bp.route("/api/users", methods=["POST"])
@admin_required
def create_user_api():
    if not get_system_setting("allow_user_creation", True) and not g.profile.is_superadmin():
        return jsonify({"error": "User creation is disabled"}), 403
    max_u = int(get_system_setting("max_users", 0) or 0)
    if max_u > 0 and Profile.query.filter_by(role="user").count() >= max_u:
        return jsonify({"error": f"User limit reached ({max_u})"}), 403

    data = request.json or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    display_name = (data.get("displayName") or "").strip()
    if not email or len(password) < 8:
        return jsonify({"error": "Valid email and password (8+ chars) required"}), 400
    try:
        user = create_user(email, password, display_name, role="user", actor_id=g.profile.id)
        return jsonify({"ok": True, "user": profile_dict(user)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/<user_id>", methods=["GET"])
@admin_required
def get_user_api(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target or (g.profile.role == "admin" and target.role != "user"):
        return jsonify({"error": "Not found"}), 404
    return jsonify(profile_dict(target, include_stats=True))


@bp.route("/api/users/<user_id>", methods=["PUT"])
@admin_required
def update_user_api(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    try:
        update_user_profile(target, request.json or {}, g.profile)
        return jsonify({"ok": True, "user": profile_dict(target, include_stats=True)})
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/users/<user_id>", methods=["DELETE"])
@admin_required
def delete_user_api(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target:
        return jsonify({"error": "Not found"}), 404
    try:
        delete_user(target, g.profile)
        return jsonify({"ok": True})
    except (PermissionError, ValueError) as e:
        return jsonify({"error": str(e)}), 403


@bp.route("/api/users/<user_id>/reset-password", methods=["POST"])
@admin_required
def reset_password_api(user_id):
    target = db.session.get(Profile, _uid(user_id))
    if not target or (g.profile.role == "admin" and target.role != "user"):
        return jsonify({"error": "Not found"}), 404
    try:
        send_password_reset(target.email)
        from app.services.audit import audit
        audit("password_reset_sent", f"email={target.email}", actor_id=g.profile.id, target_id=target.id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/activity", methods=["GET"])
@admin_required
def admin_activity():
    rows = AuditLog.query.filter_by(actor_id=g.profile.id).order_by(AuditLog.created_at.desc()).limit(200).all()
    return jsonify([{
        "action": r.action,
        "detail": r.detail,
        "targetId": str(r.target_id) if r.target_id else None,
        "ip": r.ip,
        "at": r.created_at.isoformat(timespec="seconds"),
    } for r in rows])


@bp.route("/api/stats", methods=["GET"])
@admin_required
def admin_stats():
    users = Profile.query.filter_by(role="user").all()
    today = datetime.utcnow().date()
    created_today = sum(1 for u in users if u.created_at and u.created_at.date() == today)
    return jsonify({
        "totalUsers": len(users),
        "activeUsers": sum(1 for u in users if u.is_active),
        "disabledUsers": sum(1 for u in users if not u.is_active),
        "createdToday": created_today,
    })
