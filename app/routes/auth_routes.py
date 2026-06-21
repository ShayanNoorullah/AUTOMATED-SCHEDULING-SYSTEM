import time
from datetime import datetime

from flask import Blueprint, g, jsonify, redirect, render_template, request, url_for

from app.auth.decorators import (
    authenticate_request,
    clear_auth_cookies,
    get_supabase_admin,
    load_profile,
    login_required,
    set_auth_cookies,
    bootstrap_superadmin,
)
from app.config import Config
from app.models import db, Profile
from app.services.audit import audit, client_ip

bp = Blueprint("auth", __name__)

_login_attempts = {}
LOCK_THRESHOLD, LOCK_WINDOW = 5, 300


def _too_many(ip):
    now = time.time()
    fails = [t for t in _login_attempts.get(ip, []) if now - t < LOCK_WINDOW]
    _login_attempts[ip] = fails
    return len(fails) >= LOCK_THRESHOLD


def _record_fail(ip):
    _login_attempts.setdefault(ip, []).append(time.time())


def _home_for_role(role):
    if role == "superadmin":
        return "/superadmin"
    if role == "admin":
        return "/admin"
    return "/"


@bp.route("/login")
def login_page():
    profile = authenticate_request()
    if profile:
        return redirect(_home_for_role(profile.role))
    return render_template(
        "auth/login.html",
        supabase_url=Config.SUPABASE_URL,
        supabase_anon_key=Config.SUPABASE_ANON_KEY,
    )


@bp.route("/auth/forgot-password")
def forgot_password_page():
    return render_template(
        "auth/forgot_password.html",
        supabase_url=Config.SUPABASE_URL,
        supabase_anon_key=Config.SUPABASE_ANON_KEY,
    )


@bp.route("/auth/session", methods=["POST"])
def auth_session():
    ip = client_ip()
    if _too_many(ip):
        return jsonify({"error": "Too many attempts. Try again in a few minutes."}), 429

    data = request.json or {}
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    if not access_token:
        return jsonify({"error": "Missing tokens"}), 400

    from app.auth.decorators import verify_jwt
    claims = verify_jwt(access_token)
    if not claims:
        _record_fail(ip)
        return jsonify({
            "error": "Invalid session — check SUPABASE_JWT_SECRET in run.local.bat, "
                     "or ensure the SQL migration was run in Supabase."
        }), 401

    email = (claims.get("email") or "").lower()
    sub = claims.get("sub")
    try:
        profile = load_profile(sub, email)
        profile = bootstrap_superadmin(profile)
    except Exception as e:
        return jsonify({"error": f"Database error: {e}. Run supabase/migrations/001_initial_schema.sql"}), 500
    if not profile.is_active:
        return jsonify({"error": "Account is disabled"}), 403

    profile.last_login_at = datetime.utcnow()
    db.session.commit()
    _login_attempts.pop(ip, None)
    audit("login", f"email={email}", actor_id=profile.id)

    resp = jsonify({"ok": True, "redirect": _home_for_role(profile.role)})
    return set_auth_cookies(resp, access_token, refresh_token or "")


@bp.route("/auth/refresh", methods=["POST"])
def auth_refresh():
    data = request.json or {}
    refresh = request.cookies.get("sb_refresh_token") or data.get("refresh_token")
    if not refresh:
        return jsonify({"error": "No refresh token"}), 401
    try:
        sb = get_supabase_admin()
        session = sb.auth.refresh_session(refresh)
        resp = jsonify({"ok": True})
        return set_auth_cookies(resp, session.session.access_token, session.session.refresh_token)
    except Exception:
        return jsonify({"error": "Session expired"}), 401


@bp.route("/logout")
def logout():
    profile = authenticate_request()
    if profile:
        audit("logout", actor_id=profile.id)
    resp = redirect(url_for("auth.login_page"))
    return clear_auth_cookies(resp)


@bp.route("/api/auth/me")
@login_required
def auth_me():
    p = g.profile
    return jsonify({
        "id": str(p.id),
        "email": p.email,
        "displayName": p.display_name or "",
        "role": p.role,
        "createdAt": p.created_at.isoformat(timespec="seconds") if p.created_at else None,
    })
