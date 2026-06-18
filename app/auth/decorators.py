import uuid
from functools import wraps

import jwt
from flask import g, jsonify, redirect, request

from app.config import Config, COOKIE_ACCESS, COOKIE_REFRESH
from app.models import Profile, db


def get_supabase_admin():
    from supabase import create_client
    if not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY not configured")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)


def verify_jwt(token):
    """Validate Supabase access token (HS256 legacy secret or Auth API)."""
    if not token:
        return None

    # 1) Legacy HS256 JWT secret
    if Config.SUPABASE_JWT_SECRET:
        for kwargs in (
            {"algorithms": ["HS256"], "audience": "authenticated"},
            {"algorithms": ["HS256"], "options": {"verify_aud": False}},
        ):
            try:
                return jwt.decode(token, Config.SUPABASE_JWT_SECRET, **kwargs)
            except jwt.PyJWTError:
                pass

    # 2) Supabase Auth API (works with current signing keys)
    if Config.SUPABASE_URL and Config.SUPABASE_ANON_KEY:
        try:
            import httpx
            r = httpx.get(
                f"{Config.SUPABASE_URL.rstrip('/')}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": Config.SUPABASE_ANON_KEY,
                },
                timeout=10,
            )
            if r.status_code == 200:
                user = r.json()
                return {"sub": user.get("id"), "email": user.get("email")}
        except Exception:
            pass

    return None


def get_token_from_request():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get(COOKIE_ACCESS)


def load_profile(user_id, email=None):
    uid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
    profile = db.session.get(Profile, uid)
    if profile:
        return profile
    if not email:
        return None
    role = "user"
    if Config.SUPERADMIN_EMAIL and email.lower() == Config.SUPERADMIN_EMAIL:
        if not Profile.query.filter_by(role="superadmin").first():
            role = "superadmin"
    profile = Profile(id=uid, email=email.lower(), display_name=email.split("@")[0], role=role)
    db.session.add(profile)
    db.session.commit()
    return profile


def bootstrap_superadmin(profile):
    if not Config.SUPERADMIN_EMAIL:
        return profile
    if profile.email.lower() != Config.SUPERADMIN_EMAIL:
        return profile
    existing = Profile.query.filter_by(role="superadmin").first()
    if existing and existing.id != profile.id:
        return profile
    if profile.role != "superadmin":
        profile.role = "superadmin"
        db.session.commit()
    return profile


def set_auth_cookies(response, access_token, refresh_token):
    secure = Config.FORCE_HTTPS
    response.set_cookie(COOKIE_ACCESS, access_token, httponly=True, secure=secure, samesite="Lax", max_age=3600)
    response.set_cookie(COOKIE_REFRESH, refresh_token, httponly=True, secure=secure, samesite="Lax", max_age=60 * 60 * 24 * 30)
    return response


def clear_auth_cookies(response):
    response.set_cookie(COOKIE_ACCESS, "", expires=0, httponly=True)
    response.set_cookie(COOKIE_REFRESH, "", expires=0, httponly=True)
    return response


def authenticate_request():
    token = get_token_from_request()
    if not token:
        return None
    claims = verify_jwt(token)
    if not claims:
        return None
    sub = claims.get("sub")
    email = claims.get("email", "")
    if not sub:
        return None
    profile = load_profile(sub, email)
    profile = bootstrap_superadmin(profile)
    if not profile.is_active:
        return None
    return profile


def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        profile = authenticate_request()
        if not profile:
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect("/login")
        g.profile = profile
        g.user_id = profile.id
        return f(*args, **kwargs)
    return wrapped


def admin_required(f):
    @wraps(f)
    @login_required
    def wrapped(*args, **kwargs):
        if not g.profile.is_admin():
            if request.path.startswith("/api/"):
                return jsonify({"error": "forbidden"}), 403
            return redirect("/")
        return f(*args, **kwargs)
    return wrapped


def superadmin_required(f):
    @wraps(f)
    @login_required
    def wrapped(*args, **kwargs):
        if not g.profile.is_superadmin():
            if request.path.startswith("/api/"):
                return jsonify({"error": "forbidden"}), 403
            return redirect("/")
        return f(*args, **kwargs)
    return wrapped
