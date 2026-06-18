import uuid

from flask import Blueprint, g, jsonify, render_template, request, Response
import queue

from app.auth.decorators import login_required, superadmin_required
from app.config import Config, DAYS
from app.crypto import enc, dec
from app.models import Group, Template, Contact, Profile, AuditLog, db
from app.services.audit import audit
from app.services.users import maintenance_mode
from app.services.whatsapp import (
    group_dict, template_dict, contact_dict, digits, format_message,
    run_release, status_queue, release_lock,
)

bp = Blueprint("user", __name__)


def _parse_uid(s):
    try:
        return uuid.UUID(str(s))
    except (ValueError, TypeError):
        return None


def _effective_user_id():
    if g.profile.is_superadmin() and request.args.get("asUser"):
        try:
            return uuid.UUID(request.args.get("asUser"))
        except (ValueError, TypeError):
            pass
    return g.profile.id


def _seed_default_template(user_id):
    from app.services.template_seed import seed_default_template_for_user
    seed_default_template_for_user(user_id)


@bp.route("/")
@login_required
def index():
    return render_template(
        "user/index.html",
        days=DAYS,
        username=g.profile.display_label(),
        role=g.profile.role,
        csrf_token="",
    )


@bp.route("/profile")
@login_required
def profile_page():
    return render_template("user/profile.html", profile=g.profile)


@bp.route("/api/profile", methods=["GET"])
@login_required
def get_profile():
    p = g.profile
    return jsonify({
        "email": p.email,
        "displayName": p.display_name or "",
        "role": p.role,
        "createdAt": p.created_at.isoformat(timespec="seconds") if p.created_at else None,
        "lastLoginAt": p.last_login_at.isoformat(timespec="seconds") if p.last_login_at else None,
    })


@bp.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():
    from app.services.users import update_user_profile
    data = request.json or {}
    try:
        update_user_profile(g.profile, data, g.profile)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    return jsonify({"ok": True})


@bp.route("/api/auth/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.json or {}
    current = data.get("current") or ""
    new_pw = data.get("new") or ""
    if len(new_pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    try:
        from app.auth.decorators import get_supabase_admin
        sb = get_supabase_admin()
        sb.auth.sign_in_with_password({"email": g.profile.email, "password": current})
        sb.auth.admin.update_user_by_id(str(g.profile.id), {"password": new_pw})
        audit("password_change", actor_id=g.profile.id)
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"error": "Current password is incorrect"}), 401


@bp.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    return jsonify([group_dict(g) for g in rows])


def _parse_invite_link(data):
    from app.services.whatsapp_links import validate_invite_link
    raw = (data.get("inviteLink") or data.get("invite_link") or "").strip()
    if not raw:
        return ""
    return validate_invite_link(raw)


@bp.route("/api/groups", methods=["POST"])
@login_required
def add_group():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name") or not data.get("schedule"):
        return jsonify({"error": "name and schedule required"}), 400
    if Group.query.filter_by(user_id=uid, name=data["name"]).first():
        return jsonify({"error": "Group name already exists"}), 409
    try:
        invite = _parse_invite_link(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    n = Group.query.filter_by(user_id=uid).count()
    db.session.add(Group(user_id=uid, name=data["name"], schedule=data["schedule"],
                         message_enc=enc(data.get("message", "")),
                         last_released=data.get("lastReleased", ""), invite_link=invite, position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups/<int:idx>", methods=["PUT"])
@login_required
def update_group(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    g_row = rows[idx]
    g_row.name = data["name"]
    g_row.schedule = data["schedule"]
    g_row.message_enc = enc(data.get("message", ""))
    g_row.last_released = data.get("lastReleased", g_row.last_released)
    if "inviteLink" in data or "invite_link" in data:
        try:
            g_row.invite_link = _parse_invite_link(data)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups", methods=["PUT"])
@login_required
def replace_all_groups():
    data = request.json or {}
    uid = _effective_user_id()
    groups = data.get("groups")
    if groups is None:
        return jsonify({"error": "groups list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    for i, g_item in enumerate(groups):
        inv = ""
        try:
            inv = _parse_invite_link(g_item)
        except ValueError:
            inv = ""
        db.session.add(Group(user_id=uid, name=g_item.get("name", ""), schedule=g_item.get("schedule", []),
                             message_enc=enc(g_item.get("message", "")), last_released=g_item.get("lastReleased", ""),
                             invite_link=inv, position=i))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups/<int:idx>", methods=["DELETE"])
@login_required
def delete_group(idx):
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx])
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates", methods=["GET"])
@login_required
def get_templates():
    from app.services.template_seed import ensure_default_template, DEFAULT_TEMPLATE_NAME
    uid = _effective_user_id()
    ensure_default_template(uid)
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    out = []
    for t in rows:
        d = template_dict(t)
        d["isDefault"] = t.name == DEFAULT_TEMPLATE_NAME
        out.append(d)
    return jsonify(out)


@bp.route("/api/templates", methods=["POST"])
@login_required
def add_template():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name"):
        return jsonify({"error": "Template name required"}), 400
    n = Template.query.filter_by(user_id=uid).count()
    db.session.add(Template(user_id=uid, name=data["name"], content_enc=enc(data.get("content", "")), position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates/<int:idx>", methods=["PUT"])
@login_required
def update_template(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    rows[idx].name = data["name"]
    rows[idx].content_enc = enc(data.get("content", ""))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates/<int:idx>", methods=["DELETE"])
@login_required
def delete_template(idx):
    from app.services.template_seed import DEFAULT_TEMPLATE_NAME, seed_default_template_for_user
    uid = _effective_user_id()
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    row = rows[idx]
    was_default = row.name == DEFAULT_TEMPLATE_NAME
    db.session.delete(row)
    if was_default:
        seed_default_template_for_user(uid)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts", methods=["GET"])
@login_required
def get_contacts():
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    return jsonify([contact_dict(c) for c in rows])


@bp.route("/api/contacts", methods=["POST"])
@login_required
def add_contact():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name") or not digits(data.get("phone")):
        return jsonify({"error": "Contact name and phone required"}), 400
    n = Contact.query.filter_by(user_id=uid).count()
    db.session.add(Contact(user_id=uid, name=data["name"], phone_enc=enc(digits(data.get("phone"))),
                          message_enc=enc(data.get("message", "")), position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts/<int:idx>", methods=["PUT"])
@login_required
def update_contact(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    c = rows[idx]
    c.name = data["name"]
    c.phone_enc = enc(digits(data.get("phone")))
    c.message_enc = enc(data.get("message", ""))
    c.last_released = data.get("lastReleased", c.last_released)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts/<int:idx>", methods=["DELETE"])
@login_required
def delete_contact(idx):
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx])
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/settings", methods=["GET"])
@login_required
def get_settings():
    uid = _effective_user_id()
    if uid != g.profile.id:
        u = db.session.get(Profile, uid)
    else:
        u = g.profile
    return jsonify({
        "headless": u.headless,
        "delaySeconds": u.delay_seconds,
        "maintenanceMode": maintenance_mode(),
        "siteName": __import__("app.services.users", fromlist=["get_system_setting"]).get_system_setting("site_name", "SSIES Schedule Sender"),
    })


@bp.route("/api/settings", methods=["PUT"])
@login_required
def update_settings():
    data = request.json or {}
    u = g.profile if _effective_user_id() == g.profile.id else db.session.get(Profile, _effective_user_id())
    if "headless" in data:
        u.headless = bool(data["headless"])
    if "delaySeconds" in data:
        try:
            u.delay_seconds = max(0, int(data["delaySeconds"]))
        except (ValueError, TypeError):
            pass
    db.session.commit()
    return jsonify({"headless": u.headless, "delaySeconds": u.delay_seconds})


@bp.route("/api/audit", methods=["GET"])
@login_required
def get_audit():
    uid = g.profile.id
    rows = AuditLog.query.filter_by(actor_id=uid).order_by(AuditLog.created_at.desc()).limit(100).all()
    return jsonify([{
        "action": r.action, "detail": r.detail, "ip": r.ip,
        "at": r.created_at.isoformat(timespec="seconds"),
    } for r in rows])


@bp.route("/api/config", methods=["GET"])
@login_required
def export_config():
    uid = _effective_user_id()
    u = db.session.get(Profile, uid)
    return jsonify({
        "groups": [group_dict(g) for g in Group.query.filter_by(user_id=uid).order_by(Group.position).all()],
        "templates": [template_dict(t) for t in Template.query.filter_by(user_id=uid).order_by(Template.position).all()],
        "contacts": [contact_dict(c) for c in Contact.query.filter_by(user_id=uid).order_by(Contact.position).all()],
        "settings": {"headless": u.headless, "delaySeconds": u.delay_seconds},
    })


@bp.route("/api/config", methods=["PUT"])
@login_required
def import_config():
    data = request.json or {}
    uid = _effective_user_id()
    if "groups" not in data or not isinstance(data["groups"], list):
        return jsonify({"error": "Invalid config: 'groups' list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    Template.query.filter_by(user_id=uid).delete()
    Contact.query.filter_by(user_id=uid).delete()
    for i, g_item in enumerate(data.get("groups", [])):
        inv = ""
        try:
            inv = _parse_invite_link(g_item)
        except ValueError:
            inv = g_item.get("inviteLink") or ""
        db.session.add(Group(user_id=uid, name=g_item.get("name", ""), schedule=g_item.get("schedule", []),
                             message_enc=enc(g_item.get("message", "")), last_released=g_item.get("lastReleased", ""),
                             invite_link=inv, position=i))
    for i, t in enumerate(data.get("templates", [])):
        db.session.add(Template(user_id=uid, name=t.get("name", ""), content_enc=enc(t.get("content", "")), position=i))
    for i, c in enumerate(data.get("contacts", [])):
        db.session.add(Contact(user_id=uid, name=c.get("name", ""), phone_enc=enc(digits(c.get("phone"))),
                              message_enc=enc(c.get("message", "")), position=i))
    s = data.get("settings", {})
    u = db.session.get(Profile, uid)
    u.headless = bool(s.get("headless", u.headless))
    u.delay_seconds = int(s.get("delaySeconds", u.delay_seconds))
    db.session.commit()
    audit("config_restore", actor_id=g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/whatsapp/status")
@login_required
def whatsapp_status():
    from app.services.whatsapp_provider import session_info
    info = session_info()
    return jsonify({
        "sessionCached": info.get("connected", False),
        "provider": info.get("provider"),
        "status": info.get("status"),
        "detail": info.get("detail"),
        "webUrl": "https://web.whatsapp.com",
    })


@bp.route("/api/whatsapp/session", methods=["GET"])
@login_required
def whatsapp_session():
    from app.services.whatsapp_provider import session_info
    return jsonify(session_info())


@bp.route("/api/whatsapp/session/start", methods=["POST"])
@login_required
def whatsapp_session_start():
    from app.services.whatsapp_provider import get_provider
    provider = get_provider()
    if provider == "waha":
        from app.services.waha_client import WahaError, start_session
        try:
            return jsonify(start_session())
        except WahaError as e:
            return jsonify({"error": str(e), "connected": False}), 400
    if provider == "selenium":
        return jsonify({"ok": True, "message": "Use Automated Send to open Chrome and scan QR"})
    return jsonify({"error": "Automation disabled"}), 400


@bp.route("/api/whatsapp/session/qr", methods=["GET"])
@login_required
def whatsapp_session_qr():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "QR available only for WAHA provider"}), 400
    from app.services.waha_client import get_qr
    try:
        return jsonify(get_qr())
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/whatsapp/session/reset", methods=["POST"])
@login_required
def whatsapp_session_reset():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "Reset available only for WAHA provider"}), 400
    from app.services.waha_client import WahaError, reset_session
    try:
        return jsonify(reset_session())
    except WahaError as e:
        return jsonify({"error": str(e), "connected": False}), 400


@bp.route("/api/whatsapp/session/stop", methods=["POST"])
@login_required
def whatsapp_session_stop():
    from app.services.whatsapp_provider import get_provider
    if get_provider() == "waha":
        from app.services.waha_client import stop_session
        return jsonify(stop_session())
    return jsonify({"ok": True})


@bp.route("/api/whatsapp/groups", methods=["GET"])
@login_required
def whatsapp_waha_groups():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "Available only when WAHA provider is active"}), 400
    from app.services.waha_client import WahaError, list_groups
    try:
        return jsonify({"groups": list_groups()})
    except WahaError as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/whatsapp/links", methods=["GET", "POST"])
@login_required
def whatsapp_links():
    from app.services.whatsapp_links import build_links_for_user
    uid = _effective_user_id()
    if request.method == "POST":
        data = request.json or {}
        targets = data.get("targets")
        groups = data.get("groups")
        contacts = data.get("contacts")
        if targets and not groups and not contacts:
            groups = [t for t in targets if t.get("type", "group") != "contact"]
            contacts = [t for t in targets if t.get("type") == "contact"]
        return jsonify(build_links_for_user(uid, groups=groups, contacts=contacts))
    return jsonify(build_links_for_user(uid))


@bp.route("/api/whatsapp/direct-log", methods=["POST"])
@login_required
def whatsapp_direct_log():
    from app.services.whatsapp_links import log_direct_open
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    log_direct_open(_effective_user_id(), name, data.get("type", "group"), g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/release", methods=["POST"])
@login_required
def release():
    if maintenance_mode() and not g.profile.is_admin():
        return jsonify({"error": "System is in maintenance mode"}), 503

    uid = _effective_user_id()
    u = db.session.get(Profile, uid)
    data = request.json or {}
    targets = data.get("targets")
    if not targets:
        rows = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        targets = [{"name": g.name, "message": dec(g.message_enc) or format_message(g.schedule)} for g in rows]

    from flask import current_app
    ok, err = run_release(current_app._get_current_object(), uid, u.headless, u.delay_seconds, targets, g.profile.id)
    if not ok:
        code = 409 if err == "Release already in progress" else 400
        return jsonify({"error": err}), code
    return jsonify({"ok": True})


@bp.route("/api/status")
@login_required
def status_stream():
    def gen():
        while True:
            try:
                yield f"data: {status_queue.get(timeout=30)}\n\n"
            except queue.Empty:
                yield "data: ping\n\n"
    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@bp.route("/health")
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "release_busy": release_lock.locked(),
    })
