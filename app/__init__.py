import os

from flask import Flask, g, jsonify, redirect, request
from flask_wtf.csrf import CSRFProtect, generate_csrf
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.config import Config
from app.models import db


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates"),
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "static"),
    )
    app.config.from_object(Config)

    db.init_app(app)
    csrf = CSRFProtect(app)
    limiter = Limiter(get_remote_address, app=app, default_limits=["200 per minute"])

    # Security headers when HTTPS enabled (Caddy terminates TLS in Docker — no force_https redirect)
    docker = os.environ.get("DOCKER") == "1"
    if Config.FORCE_HTTPS:
        try:
            from flask_talisman import Talisman
            Talisman(
                app,
                force_https=not docker,
                session_cookie_secure=True,
                # Templates use inline <style>/<script> and external CDNs (Supabase, fonts).
                content_security_policy=False,
            )
        except ImportError:
            pass

    if Config.FORCE_HTTPS or docker:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    from app.routes.auth_routes import bp as auth_bp
    from app.routes.user_routes import bp as user_bp
    from app.routes.admin_routes import bp as admin_bp
    from app.routes.superadmin_routes import bp as superadmin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(superadmin_bp)

    PUBLIC_ENDPOINTS = {
        "auth.login_page", "auth.forgot_password_page", "auth.auth_session",
        "auth.auth_refresh", "static", "user.health", "user.mobile_config",
        "user.mobile_download_page", "user.mobile_download_apk",
    }

    @app.before_request
    def inject_csrf():
        g.csrf_token = generate_csrf()

    @app.context_processor
    def csrf_processor():
        from app.services.users import get_system_setting
        return dict(
            csrf_token=generate_csrf(),
            site_name=get_system_setting("site_name", "SSIES Schedule Sender"),
        )

    @app.before_request
    def global_auth_guard():
        if request.endpoint in PUBLIC_ENDPOINTS or (request.endpoint and request.endpoint.startswith("static")):
            return
        if request.endpoint == "auth.logout":
            return
        from app.auth.decorators import authenticate_request
        profile = authenticate_request()
        if profile:
            g.profile = profile
            g.user_id = profile.id
            return
        if request.path.startswith("/api/"):
            return jsonify({"error": "unauthorized"}), 401
        if request.endpoint not in ("auth.login_page", "auth.forgot_password_page", "auth.auth_session"):
            return redirect("/login")

    csrf.exempt(auth_bp)
    for bp in (user_bp, admin_bp, superadmin_bp):
        csrf.exempt(bp)

    limiter.limit("10 per minute")(app.view_functions["auth.auth_session"])

    if not Config.DATABASE_URL or Config.DATABASE_URL.startswith("sqlite"):
        print("WARNING: DATABASE_URL must point to Supabase PostgreSQL for production.")
    with app.app_context():
        if not Config.DATABASE_URL.startswith("sqlite"):
            db.create_all()
            _seed_system_settings()
            _ensure_invite_link_column()
            if os.environ.get("DOCKER") == "1":
                _apply_docker_waha_settings()
        else:
            try:
                db.create_all()
                _seed_system_settings()
                _ensure_invite_link_column()
            except Exception as e:
                print("NOTE: SQLite dev mode limited — configure Supabase DATABASE_URL:", e)

    try:
        from app.services.scheduler import start_scheduler
        start_scheduler(app)
    except ImportError:
        print("NOTE: Install APScheduler for scheduled weekly sends: pip install APScheduler")

    return app


def _seed_system_settings():
    from app.models import SystemSetting
    docker = os.environ.get("DOCKER") == "1"
    waha_key = (os.environ.get("WAHA_API_KEY") or "").strip()
    defaults = {
        "maintenance_mode": False,
        "site_name": "SSIES Schedule Sender",
        "default_delay_seconds": 5,
        "allow_user_creation": True,
        "wa_provider": "waha" if docker else "selenium",
        "waha_base_url": "http://waha:3000" if docker else "http://localhost:3000",
        "waha_api_key": waha_key if docker else "",
        "waha_session_name": "default",
        "max_users": 0,
    }
    for key, val in defaults.items():
        if not db.session.get(SystemSetting, key):
            db.session.add(SystemSetting(key=key, value=val))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def _apply_docker_waha_settings():
    """Keep WAHA settings aligned with container env on each deploy."""
    from app.services.users import set_system_setting

    waha_key = (os.environ.get("WAHA_API_KEY") or "").strip()
    set_system_setting("wa_provider", "waha")
    set_system_setting("waha_base_url", "http://waha:3000")
    if waha_key:
        set_system_setting("waha_api_key", waha_key)
    set_system_setting("waha_session_name", "default")


def _ensure_invite_link_column():
    from sqlalchemy import inspect, text
    try:
        insp = inspect(db.engine)
        if "groups" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("groups")}
        if "invite_link" not in cols:
            db.session.execute(text("ALTER TABLE groups ADD COLUMN invite_link TEXT DEFAULT ''"))
            db.session.commit()
    except Exception:
        db.session.rollback()
