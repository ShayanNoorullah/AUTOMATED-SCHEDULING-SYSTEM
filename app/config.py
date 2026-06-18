import os
import secrets
import base64

from cryptography.fernet import Fernet

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DEFAULT_DELAY = 5

COOKIE_ACCESS = "sb_access_token"
COOKIE_REFRESH = "sb_refresh_token"


def _persisted(name, factory):
    path = os.path.join(INSTANCE_DIR, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    val = factory()
    with open(path, "w", encoding="utf-8") as f:
        f.write(val)
    return val


def _normalize_db_url(url):
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("APP_SECRET_KEY") or _persisted("secret.key", lambda: secrets.token_hex(32))
    FORCE_HTTPS = os.environ.get("FORCE_HTTPS") == "1"

    DATABASE_URL = _normalize_db_url(os.environ.get("DATABASE_URL", ""))
    if not DATABASE_URL:
        DATABASE_URL = "sqlite:///" + os.path.join(INSTANCE_DIR, "app.db")

    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
    SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "").strip().lower()

    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = FORCE_HTTPS

    _enc_key = os.environ.get("APP_ENCRYPTION_KEY") or _persisted("enc.key", lambda: Fernet.generate_key().decode())

    @classmethod
    def fernet(cls):
        key = cls._enc_key
        try:
            return Fernet(key.encode() if isinstance(key, str) else key)
        except Exception:
            return Fernet(base64.urlsafe_b64encode(key.encode()[:32].ljust(32, b"0")))

    @classmethod
    def supabase_configured(cls):
        return bool(cls.SUPABASE_URL and cls.SUPABASE_ANON_KEY)
