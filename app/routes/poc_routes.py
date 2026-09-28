"""Phase 3 POC-parity APIs: notes, photos, notifications, password requests, passkeys, roles."""
import json
import os
import re
import secrets
import time
import uuid
from datetime import datetime

from flask import Blueprint, g, jsonify, request, send_file
from werkzeug.utils import secure_filename

from app.auth.decorators import (
    admin_required,
    login_required,
    set_auth_cookies,
    superadmin_required,
)
from app.config import INSTANCE_DIR, Config
from app.crypto import enc, dec
from app.models import (
    Contact,
    Group,
    Notification,
    PasswordRequest,
    Profile,
    Role,
    WebAuthnCredential,
    db,
)

bp = Blueprint("poc", __name__)

PHOTO_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_CHALLENGES = {}  # key → {"challenge": str, "exp": float, "user_id": str|None}
_CHALLENGE_TTL = 300

BUILTIN_ROLES = (
    ("user", "User", {"schedule": True, "send": True}),
    ("admin", "Admin", {"schedule": True, "send": True, "manage_users": True}),
    ("superadmin", "Superadmin", {"*": True}),
)


def seed_builtin_roles():
    for key, label, perms in BUILTIN_ROLES:
        row = Role.query.filter_by(key=key).first()
        if not row:
            db.session.add(Role(key=key, label=label, permissions=perms, is_builtin=True))
        elif not row.is_builtin:
            row.is_builtin = True
            row.label = label
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def _uploads_root(user_id):
    path = os.path.join(INSTANCE_DIR, "uploads", str(user_id))
    os.makedirs(path, exist_ok=True)
    return path


def _photo_url(entity, entity_id=None):
    if entity == "profile":
        return "/api/photos/file/profile"
    return f"/api/photos/file/{entity}/{int(entity_id)}"


def _safe_relpath(user_id, filename):
    name = secure_filename(filename) or "photo.bin"
    return os.path.join(str(user_id), name)


def _abs_upload(relpath):
    full = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads", relpath))
    root = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads"))
    if not full.startswith(root + os.sep) and full != root:
        return None
    return full


def _store_challenge(kind, challenge_b64, user_id=None, email=None):
    key = f"{kind}:{user_id or email or 'anon'}:{secrets.token_hex(8)}"
    _CHALLENGES[key] = {
        "challenge": challenge_b64,
        "exp": time.time() + _CHALLENGE_TTL,
        "user_id": str(user_id) if user_id else None,
        "email": (email or "").lower() or None,
    }
    # prune
    now = time.time()
    dead = [k for k, v in _CHALLENGES.items() if v["exp"] < now]
    for k in dead:
        _CHALLENGES.pop(k, None)
    return key


def _pop_challenge(key):
    data = _CHALLENGES.pop(key, None)
    if not data or data["exp"] < time.time():
        return None
    return data


def _rp_id_origin():
    """WebAuthn RP ID + origin. Behind Caddy, Flask often sees http — prefer https in prod."""
    host = (request.host or "").split(":")[0] or "localhost"
    rp_id = (os.environ.get("WEBAUTHN_RP_ID") or host).strip() or "localhost"
    origin = (os.environ.get("WEBAUTHN_ORIGIN") or "").strip().rstrip("/")
    if not origin:
        # Prefer forwarded proto from Caddy; fall back to FORCE_HTTPS / request scheme
        proto = (request.headers.get("X-Forwarded-Proto") or request.scheme or "http").split(",")[0].strip()
        if os.environ.get("FORCE_HTTPS") == "1" and host not in ("localhost", "127.0.0.1"):
            proto = "https"
        origin = f"{proto}://{host}"
    # Common misconfig: WEBAUTHN_ORIGIN=http://… while the site is served over HTTPS
    if origin.startswith("http://") and host not in ("localhost", "127.0.0.1"):
        if os.environ.get("FORCE_HTTPS") == "1" or (request.headers.get("X-Forwarded-Proto") or "").startswith("https"):
            origin = "https://" + origin[len("http://"):]
    return rp_id, origin.rstrip("/")


def _webauthn_or_501():
    try:
        import webauthn  # noqa: F401
        return None
    except ImportError:
        return jsonify({
            "error": "Passkeys require the webauthn package. Install: pip install 'webauthn>=2.0'",
        }), 501


def _mint_access_token(profile):
    """Issue a short-lived Supabase-compatible JWT after passkey verify."""
    if not Config.SUPABASE_JWT_SECRET:
        raise RuntimeError("SUPABASE_JWT_SECRET required for passkey login")
    import jwt as pyjwt
    now = int(time.time())
    payload = {
        "sub": str(profile.id),
        "email": profile.email,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    return pyjwt.encode(payload, Config.SUPABASE_JWT_SECRET, algorithm="HS256")


def _notify_admins(text):
    admins = Profile.query.filter(Profile.role.in_(("admin", "superadmin")), Profile.is_active.is_(True)).all()
    for a in admins:
        db.session.add(Notification(user_id=a.id, text=text, read=False))


# ── Scheduler notes ──────────────────────────────────────────────────────────

@bp.route("/api/scheduler/notes", methods=["GET"])
@login_required
def get_notes():
    return jsonify({"notes": g.profile.table_notes or ""})


@bp.route("/api/scheduler/notes", methods=["PUT"])
@login_required
def put_notes():
    data = request.json or {}
    notes = data.get("notes")
    if notes is None:
        notes = data.get("table_notes", "")
    g.profile.table_notes = str(notes)[:50000]
    db.session.commit()
    return jsonify({"ok": True, "notes": g.profile.table_notes or ""})


# ── Photos ───────────────────────────────────────────────────────────────────

@bp.route("/api/photos/<entity>", methods=["POST"])
@login_required
def upload_photo(entity):
    entity = (entity or "").lower()
    if entity not in ("profile", "groups", "contacts"):
        return jsonify({"error": "entity must be profile, groups, or contacts"}), 400

    f = request.files.get("file") or request.files.get("photo")
    if not f or not f.filename:
        return jsonify({"error": "file required"}), 400

    raw = f.read(PHOTO_MAX_BYTES + 1)
    if len(raw) > PHOTO_MAX_BYTES:
        return jsonify({"error": "Image must be 1 MB or smaller"}), 400
    if not raw:
        return jsonify({"error": "Empty file"}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_PHOTO_EXT:
        return jsonify({"error": "Allowed types: jpg, png, gif, webp"}), 400

    uid = g.profile.id
    root = _uploads_root(uid)

    if entity == "profile":
        fname = f"profile{ext}"
        abs_path = os.path.join(root, fname)
        with open(abs_path, "wb") as out:
            out.write(raw)
        # remove old alternate extensions
        if g.profile.photo_path:
            old = _abs_upload(g.profile.photo_path)
            if old and old != abs_path and os.path.isfile(old):
                try:
                    os.remove(old)
                except OSError:
                    pass
        g.profile.photo_path = _safe_relpath(uid, fname)
        db.session.commit()
        url = _photo_url("profile")
        return jsonify({"ok": True, "url": url, "photo_url": url})

    try:
        entity_id = int(request.form.get("id") or request.args.get("id") or 0)
    except (TypeError, ValueError):
        entity_id = 0
    if not entity_id:
        return jsonify({"error": "id required for groups/contacts"}), 400

    Model = Group if entity == "groups" else Contact
    row = Model.query.filter_by(id=entity_id, user_id=uid).first()
    if not row:
        return jsonify({"error": "Not found"}), 404

    fname = f"{entity}_{entity_id}{ext}"
    abs_path = os.path.join(root, fname)
    with open(abs_path, "wb") as out:
        out.write(raw)
    if row.photo_path:
        old = _abs_upload(row.photo_path)
        if old and old != abs_path and os.path.isfile(old):
            try:
                os.remove(old)
            except OSError:
                pass
    row.photo_path = _safe_relpath(uid, fname)
    db.session.commit()
    url = _photo_url(entity, entity_id)
    return jsonify({"ok": True, "url": url, "photo_url": url})


@bp.route("/api/photos/<entity>", methods=["DELETE"])
@login_required
def delete_photo(entity):
    entity = (entity or "").lower()
    if entity not in ("profile", "groups", "contacts"):
        return jsonify({"error": "entity must be profile, groups, or contacts"}), 400

    uid = g.profile.id
    if entity == "profile":
        row = g.profile
        rel = row.photo_path
        row.photo_path = None
    else:
        try:
            entity_id = int(request.args.get("id") or (request.json or {}).get("id") or 0)
        except (TypeError, ValueError):
            entity_id = 0
        if not entity_id:
            return jsonify({"error": "id required"}), 400
        Model = Group if entity == "groups" else Contact
        row = Model.query.filter_by(id=entity_id, user_id=uid).first()
        if not row:
            return jsonify({"error": "Not found"}), 404
        rel = row.photo_path
        row.photo_path = None

    if rel:
        path = _abs_upload(rel)
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/photos/file/profile", methods=["GET"])
@login_required
def serve_profile_photo():
    rel = g.profile.photo_path
    if not rel:
        return jsonify({"error": "No photo"}), 404
    path = _abs_upload(rel)
    if not path or not os.path.isfile(path):
        return jsonify({"error": "Missing file"}), 404
    return send_file(path)


@bp.route("/api/photos/file/<entity>/<int:entity_id>", methods=["GET"])
@login_required
def serve_entity_photo(entity, entity_id):
    entity = (entity or "").lower()
    if entity not in ("groups", "contacts"):
        return jsonify({"error": "invalid entity"}), 400
    Model = Group if entity == "groups" else Contact
    row = Model.query.filter_by(id=entity_id, user_id=g.profile.id).first()
    if not row or not row.photo_path:
        return jsonify({"error": "No photo"}), 404
    path = _abs_upload(row.photo_path)
    if not path or not os.path.isfile(path):
        return jsonify({"error": "Missing file"}), 404
    return send_file(path)


# Auth-gated alias matching /uploads/... layout on disk
@bp.route("/uploads/<user_id>/<path:filename>", methods=["GET"])
@login_required
def serve_upload_alias(user_id, filename):
    if str(g.profile.id) != str(user_id) and not g.profile.is_superadmin():
        return jsonify({"error": "forbidden"}), 403
    path = _abs_upload(os.path.join(user_id, filename))
    if not path or not os.path.isfile(path):
        return jsonify({"error": "Not found"}), 404
    return send_file(path)


# ── Notifications ────────────────────────────────────────────────────────────

@bp.route("/api/notifications", methods=["GET"])
@login_required
def list_notifications():
    try:
        limit = int(request.args.get("limit") or 100)
    except (TypeError, ValueError):
        limit = 100
    limit = max(1, min(limit, 1000))
    rows = (
        Notification.query.filter_by(user_id=g.profile.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    items = [{
        "id": n.id,
        "text": n.text,
        "read": bool(n.read),
        "created_at": n.created_at.isoformat(timespec="seconds") if n.created_at else None,
        "at": n.created_at.isoformat(timespec="seconds") if n.created_at else None,
    } for n in rows]

    pending = []
    if g.profile.is_admin():
        reqs = (
            PasswordRequest.query.filter_by(status="pending")
            .order_by(PasswordRequest.created_at.desc())
            .limit(50)
            .all()
        )
        for r in reqs:
            role = "user"
            if r.user_id:
                p = db.session.get(Profile, r.user_id)
                if p:
                    role = p.role
            pending.append({
                "id": r.id,
                "email": r.email,
                "user_email": r.email,
                "user_role": role,
                "role": role,
                "created_at": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
                "requested_at": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
            })

    return jsonify({"notifications": items, "items": items, "pending": pending})


@bp.route("/api/notifications/read", methods=["POST"])
@login_required
def mark_notifications_read():
    data = request.json or {}
    ids = data.get("ids")
    q = Notification.query.filter_by(user_id=g.profile.id, read=False)
    if ids:
        q = q.filter(Notification.id.in_(ids))
    q.update({"read": True}, synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True})


# ── Password reset requests ──────────────────────────────────────────────────
# Pending password is stored as Fernet ciphertext (APP_ENCRYPTION_KEY), not plaintext
# and not a one-way hash — so approve can decrypt → Supabase admin.update_user → wipe.

@bp.route("/api/profile/password-request", methods=["GET", "POST"])
@login_required
def profile_password_request():
    """Logged-in users/admins request a password reset (superadmin changes directly)."""
    if request.method == "GET":
        row = (
            PasswordRequest.query.filter_by(user_id=g.profile.id, status="pending")
            .order_by(PasswordRequest.created_at.desc())
            .first()
        )
        if not row:
            return jsonify({"pending": None})
        return jsonify({
            "pending": {
                "id": row.id,
                "requested_at": row.created_at.isoformat(timespec="seconds") if row.created_at else None,
                "requestedAt": row.created_at.isoformat(timespec="seconds") if row.created_at else None,
            }
        })

    if g.profile.role == "superadmin":
        return jsonify({"error": "Superadmins can change their password directly"}), 400

    data = request.json or {}
    current = data.get("current") or ""
    new_pw = data.get("password") or data.get("new") or ""
    if len(new_pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if not current:
        return jsonify({"error": "Current password is required"}), 400

    try:
        from app.auth.decorators import get_supabase_admin
        sb = get_supabase_admin()
        sb.auth.sign_in_with_password({"email": g.profile.email, "password": current})
    except Exception:
        return jsonify({"error": "Current password is incorrect"}), 401

    email = g.profile.email
    PasswordRequest.query.filter_by(email=email, status="pending").update(
        {"status": "rejected", "resolved_at": datetime.utcnow()},
        synchronize_session=False,
    )
    req = PasswordRequest(
        user_id=g.profile.id,
        email=email,
        password_enc=enc(new_pw),
        status="pending",
    )
    db.session.add(req)
    _notify_admins(f"Password reset requested by {email}")
    db.session.commit()
    return jsonify({
        "ok": True,
        "pending": True,
        "message": "Password reset requested — awaiting approval",
    })


@bp.route("/api/password-requests", methods=["POST"])
def create_password_request():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    profile = Profile.query.filter_by(email=email).first()
    # Avoid leaking whether email exists — always accept shape, but only persist if known user
    if profile:
        # supersede prior pending for same email
        PasswordRequest.query.filter_by(email=email, status="pending").update(
            {"status": "rejected", "resolved_at": datetime.utcnow()},
            synchronize_session=False,
        )
        req = PasswordRequest(
            user_id=profile.id,
            email=email,
            password_enc=enc(password),
            status="pending",
        )
        db.session.add(req)
        _notify_admins(f"Password reset requested by {email}")
        db.session.commit()

    return jsonify({
        "ok": True,
        "message": "Request submitted. An administrator will review it.",
    })


@bp.route("/api/password-requests", methods=["GET"])
@admin_required
def list_password_requests():
    status = (request.args.get("status") or "pending").strip().lower()
    q = PasswordRequest.query
    if status and status != "all":
        q = q.filter_by(status=status)
    rows = q.order_by(PasswordRequest.created_at.desc()).limit(200).all()
    return jsonify({
        "requests": [{
            "id": r.id,
            "email": r.email,
            "user_id": str(r.user_id) if r.user_id else None,
            "status": r.status,
            "created_at": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat(timespec="seconds") if r.resolved_at else None,
        } for r in rows]
    })


@bp.route("/api/password-requests/<int:req_id>/approve", methods=["POST"])
@admin_required
def approve_password_request(req_id):
    row = db.session.get(PasswordRequest, req_id)
    if not row or row.status != "pending":
        return jsonify({"error": "Request not found or already resolved"}), 404
    if not row.password_enc:
        return jsonify({"error": "No password on file for this request"}), 400

    plaintext = dec(row.password_enc)
    if not plaintext or plaintext == row.password_enc:
        return jsonify({"error": "Could not decrypt pending password"}), 500

    target = db.session.get(Profile, row.user_id) if row.user_id else Profile.query.filter_by(email=row.email).first()
    if not target:
        return jsonify({"error": "User not found"}), 404

    try:
        from app.auth.decorators import get_supabase_admin
        sb = get_supabase_admin()
        sb.auth.admin.update_user_by_id(str(target.id), {"password": plaintext})
    except Exception as e:
        return jsonify({"error": f"Failed to update password: {e}"}), 500

    row.status = "approved"
    row.reviewer_id = g.profile.id
    row.resolved_at = datetime.utcnow()
    row.password_enc = None  # wipe ciphertext after use
    db.session.add(Notification(
        user_id=target.id,
        text="Your password reset request was approved. You can sign in with your new password.",
        read=False,
    ))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/password-requests/<int:req_id>/reject", methods=["POST"])
@admin_required
def reject_password_request(req_id):
    row = db.session.get(PasswordRequest, req_id)
    if not row or row.status != "pending":
        return jsonify({"error": "Request not found or already resolved"}), 404
    row.status = "rejected"
    row.reviewer_id = g.profile.id
    row.resolved_at = datetime.utcnow()
    row.password_enc = None
    if row.user_id:
        db.session.add(Notification(
            user_id=row.user_id,
            text="Your password reset request was declined. Contact an administrator if you still need help.",
            read=False,
        ))
    db.session.commit()
    return jsonify({"ok": True})


# ── Passkeys (WebAuthn) ──────────────────────────────────────────────────────

@bp.route("/api/passkeys/register/options", methods=["POST"])
@login_required
def passkey_register_options():
    err = _webauthn_or_501()
    if err:
        return err
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers import bytes_to_base64url
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        PublicKeyCredentialDescriptor,
        ResidentKeyRequirement,
        UserVerificationRequirement,
    )

    rp_id, _origin = _rp_id_origin()
    existing = WebAuthnCredential.query.filter_by(user_id=g.profile.id).all()
    exclude = []
    for c in existing:
        try:
            from webauthn.helpers import base64url_to_bytes
            exclude.append(PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id)))
        except Exception:
            pass

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name="SSIES Schedule Sender",
        user_id=g.profile.id.bytes if hasattr(g.profile.id, "bytes") else uuid.UUID(str(g.profile.id)).bytes,
        user_name=g.profile.email,
        user_display_name=g.profile.display_label(),
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=exclude or None,
    )
    challenge_key = _store_challenge("reg", bytes_to_base64url(options.challenge), user_id=g.profile.id)
    body = json.loads(options_to_json(options))
    return jsonify({"publicKey": body, "challengeKey": challenge_key})


@bp.route("/api/passkeys/register/verify", methods=["POST"])
@login_required
def passkey_register_verify():
    err = _webauthn_or_501()
    if err:
        return err
    from webauthn import verify_registration_response
    from webauthn.helpers import bytes_to_base64url

    data = request.json or {}
    challenge_key = data.get("challengeKey") or data.get("challenge_key")
    stored = _pop_challenge(challenge_key) if challenge_key else None
    # Fallback: find latest reg challenge for this user
    if not stored:
        for k, v in list(_CHALLENGES.items()):
            if k.startswith("reg:") and v.get("user_id") == str(g.profile.id):
                stored = _pop_challenge(k)
                break
    if not stored:
        return jsonify({"error": "Challenge expired — try again"}), 400

    rp_id, origin = _rp_id_origin()
    credential = data.get("credential") or data
    try:
        from webauthn.helpers import base64url_to_bytes
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(stored["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=False,
        )
    except Exception as e:
        return jsonify({"error": f"Verification failed: {e}"}), 400

    cred_id = bytes_to_base64url(verification.credential_id)
    pub_key = bytes_to_base64url(verification.credential_public_key)
    transports = data.get("transports") or (credential.get("response") or {}).get("transports") or []
    db.session.add(WebAuthnCredential(
        user_id=g.profile.id,
        credential_id=cred_id,
        public_key=pub_key,
        sign_count=verification.sign_count or 0,
        transports=transports,
    ))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/passkeys/login/options", methods=["POST"])
def passkey_login_options():
    err = _webauthn_or_501()
    if err:
        return err
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
    from webauthn.helpers.structs import (
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    allow = []
    user_id = None
    if email:
        profile = Profile.query.filter_by(email=email).first()
        if profile:
            user_id = profile.id
            for c in WebAuthnCredential.query.filter_by(user_id=profile.id).all():
                try:
                    allow.append(PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id)))
                except Exception:
                    pass
        if not allow:
            return jsonify({"error": "No passkey registered for this account"}), 404

    rp_id, _origin = _rp_id_origin()
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow or None,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    challenge_key = _store_challenge(
        "login", bytes_to_base64url(options.challenge), user_id=user_id, email=email or None
    )
    body = json.loads(options_to_json(options))
    return jsonify({"publicKey": body, "challengeKey": challenge_key})


@bp.route("/api/passkeys/login/verify", methods=["POST"])
def passkey_login_verify():
    err = _webauthn_or_501()
    if err:
        return err
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    challenge_key = data.get("challengeKey") or data.get("challenge_key")
    stored = _pop_challenge(challenge_key) if challenge_key else None
    if not stored:
        for k, v in list(_CHALLENGES.items()):
            if k.startswith("login:") and (not email or v.get("email") == email):
                stored = _pop_challenge(k)
                break
    if not stored:
        return jsonify({"error": "Challenge expired — try again"}), 400

    cred_id = data.get("id") or (data.get("credential") or {}).get("id")
    if not cred_id:
        return jsonify({"error": "Missing credential id"}), 400

    # Browser may send standard base64; normalize to base64url lookup
    row = WebAuthnCredential.query.filter_by(credential_id=cred_id).first()
    if not row:
        # try converting rawId
        raw_id = data.get("rawId")
        if raw_id:
            try:
                from webauthn.helpers import bytes_to_base64url
                import base64
                pad = "=" * (-len(raw_id) % 4)
                raw_bytes = base64.b64decode(raw_id + pad)
                row = WebAuthnCredential.query.filter_by(
                    credential_id=bytes_to_base64url(raw_bytes)
                ).first()
            except Exception:
                row = None
    if not row:
        return jsonify({"error": "Unknown passkey"}), 404

    profile = db.session.get(Profile, row.user_id)
    if not profile or not profile.is_active:
        return jsonify({"error": "Account disabled"}), 403
    if email and profile.email.lower() != email:
        return jsonify({"error": "Email does not match passkey"}), 403

    rp_id, origin = _rp_id_origin()
    credential = {
        "id": data.get("id"),
        "rawId": data.get("rawId"),
        "type": data.get("type") or "public-key",
        "response": data.get("response") or {},
    }
    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(stored["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=base64url_to_bytes(row.public_key),
            credential_current_sign_count=row.sign_count or 0,
            require_user_verification=False,
        )
    except Exception as e:
        return jsonify({"error": f"Verification failed: {e}"}), 400

    row.sign_count = verification.new_sign_count
    row.last_used_at = datetime.utcnow()
    profile.last_login_at = datetime.utcnow()
    db.session.commit()

    try:
        access = _mint_access_token(profile)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    from app.routes.auth_routes import _home_for_role
    resp = jsonify({"ok": True, "redirect": _home_for_role(profile.role)})
    return set_auth_cookies(resp, access, "")


@bp.route("/api/passkeys", methods=["GET"])
@login_required
def list_passkeys():
    err = _webauthn_or_501()
    if err:
        return err
    rows = (
        WebAuthnCredential.query.filter_by(user_id=g.profile.id)
        .order_by(WebAuthnCredential.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        cid = r.credential_id or ""
        out.append({
            "id": r.id,
            "label": f"Passkey · {cid[:10]}…" if len(cid) > 10 else (f"Passkey · {cid}" if cid else "Passkey"),
            "createdAt": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
            "lastUsedAt": r.last_used_at.isoformat(timespec="seconds") if r.last_used_at else None,
            "transports": r.transports or [],
        })
    return jsonify({"passkeys": out, "supported": True})


@bp.route("/api/passkeys/<int:pk_id>", methods=["DELETE"])
@login_required
def delete_passkey(pk_id):
    err = _webauthn_or_501()
    if err:
        return err
    row = WebAuthnCredential.query.filter_by(id=pk_id, user_id=g.profile.id).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True})


# ── Roles (superadmin) ───────────────────────────────────────────────────────

def _role_dict(r):
    return {
        "id": r.id,
        "key": r.key,
        "label": r.label,
        "permissions": r.permissions or {},
        "is_builtin": bool(r.is_builtin),
        "created_at": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
    }


@bp.route("/api/roles", methods=["GET"])
@superadmin_required
def list_roles():
    seed_builtin_roles()
    rows = Role.query.order_by(Role.is_builtin.desc(), Role.key).all()
    return jsonify({"roles": [_role_dict(r) for r in rows]})


@bp.route("/api/roles", methods=["POST"])
@superadmin_required
def create_role():
    data = request.json or {}
    key = re.sub(r"[^a-z0-9_\-]", "", (data.get("key") or "").strip().lower())
    label = (data.get("label") or key).strip()[:120]
    if not key or len(key) < 2:
        return jsonify({"error": "key required (letters, numbers, _ -)"}), 400
    if Role.query.filter_by(key=key).first():
        return jsonify({"error": "Role key already exists"}), 409
    if key in ("user", "admin", "superadmin"):
        return jsonify({"error": "Cannot recreate builtin role keys"}), 400
    row = Role(key=key, label=label or key, permissions=data.get("permissions") or {}, is_builtin=False)
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "role": _role_dict(row)})


@bp.route("/api/roles/<int:role_id>", methods=["PUT"])
@superadmin_required
def update_role(role_id):
    row = db.session.get(Role, role_id)
    if not row:
        return jsonify({"error": "Not found"}), 404
    data = request.json or {}
    if "label" in data:
        row.label = str(data["label"]).strip()[:120] or row.label
    if "permissions" in data and isinstance(data["permissions"], dict):
        row.permissions = data["permissions"]
    # Builtin keys are immutable
    if not row.is_builtin and "key" in data:
        new_key = re.sub(r"[^a-z0-9_\-]", "", str(data["key"]).strip().lower())
        if new_key and new_key != row.key:
            if Role.query.filter_by(key=new_key).first():
                return jsonify({"error": "Role key already exists"}), 409
            row.key = new_key
    db.session.commit()
    return jsonify({"ok": True, "role": _role_dict(row)})


@bp.route("/api/roles/<int:role_id>", methods=["DELETE"])
@superadmin_required
def delete_role(role_id):
    row = db.session.get(Role, role_id)
    if not row:
        return jsonify({"error": "Not found"}), 404
    if row.is_builtin:
        return jsonify({"error": "Builtin roles cannot be deleted"}), 403
    in_use = Profile.query.filter_by(role=row.key).count()
    if in_use:
        return jsonify({"error": f"Role is assigned to {in_use} user(s)"}), 409
    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True})


# Also support PUT/DELETE via /api/roles with id in body for simpler clients
@bp.route("/api/roles", methods=["PUT", "DELETE"])
@superadmin_required
def roles_mutate():
    data = request.json or {}
    try:
        role_id = int(data.get("id"))
    except (TypeError, ValueError):
        return jsonify({"error": "id required"}), 400
    row = db.session.get(Role, role_id)
    if not row:
        return jsonify({"error": "Not found"}), 404
    if request.method == "DELETE":
        if row.is_builtin:
            return jsonify({"error": "Builtin roles cannot be deleted"}), 403
        in_use = Profile.query.filter_by(role=row.key).count()
        if in_use:
            return jsonify({"error": f"Role is assigned to {in_use} user(s)"}), 409
        db.session.delete(row)
        db.session.commit()
        return jsonify({"ok": True})
    if "label" in data:
        row.label = str(data["label"]).strip()[:120] or row.label
    if "permissions" in data and isinstance(data["permissions"], dict):
        row.permissions = data["permissions"]
    if not row.is_builtin and "key" in data:
        new_key = re.sub(r"[^a-z0-9_\-]", "", str(data["key"]).strip().lower())
        if new_key and new_key != row.key:
            if Role.query.filter_by(key=new_key).first():
                return jsonify({"error": "Role key already exists"}), 409
            row.key = new_key
    db.session.commit()
    return jsonify({"ok": True, "role": _role_dict(row)})
