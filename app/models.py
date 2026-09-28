import uuid
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

db = SQLAlchemy()


class GUID(TypeDecorator):
    """Platform-independent UUID type (PostgreSQL native, CHAR(36) on SQLite)."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(str(value)))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


class Profile(db.Model):
    __tablename__ = "profiles"

    id = db.Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(255))
    # TEXT (not enum) so custom role keys from the roles table work.
    role = db.Column(db.String(60), nullable=False, default="user")
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    headless = db.Column(db.Boolean, default=False)
    delay_seconds = db.Column(db.Integer, default=5)
    # Dedicated free WAHA Core container slot (1 → waha, 2 → waha2, …). Null until linked.
    waha_slot = db.Column(db.Integer, nullable=True, index=True)
    photo_path = db.Column(db.Text)
    table_notes = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)

    def is_superadmin(self):
        return self.role == "superadmin"

    def is_admin(self):
        return self.role in ("admin", "superadmin")

    def display_label(self):
        return self.display_name or self.email.split("@")[0]

    def photo_url(self):
        """Public URL only when the file actually exists on disk (avoids broken <img>)."""
        if not self.photo_path:
            return None
        import os
        from app.config import INSTANCE_DIR
        full = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads", self.photo_path))
        root = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads"))
        if not (full.startswith(root + os.sep) and os.path.isfile(full)):
            return None
        return "/api/photos/file/profile"


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    schedule = db.Column(db.JSON, default=list)
    message_enc = db.Column(db.Text, default="")
    last_released = db.Column(db.String(40), default="")
    invite_link = db.Column(db.Text, default="")
    photo_path = db.Column(db.Text)
    wa_linked = db.Column(db.Boolean, default=False, nullable=False)
    position = db.Column(db.Integer, default=0)


class Template(db.Model):
    __tablename__ = "templates"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    content_enc = db.Column(db.Text, default="")
    position = db.Column(db.Integer, default=0)


class Contact(db.Model):
    __tablename__ = "contacts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    phone_enc = db.Column(db.Text, default="")
    message_enc = db.Column(db.Text, default="")
    last_released = db.Column(db.String(40), default="")
    photo_path = db.Column(db.Text)
    wa_linked = db.Column(db.Boolean, default=False, nullable=False)
    position = db.Column(db.Integer, default=0)


class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(GUID(), index=True)
    target_id = db.Column(GUID(), index=True)
    action = db.Column(db.String(60))
    detail = db.Column(db.String(400))
    ip = db.Column(db.String(60))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ReleaseLog(db.Model):
    __tablename__ = "release_log"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    target_name = db.Column(db.String(255), nullable=False)
    target_type = db.Column(db.String(20), default="group")
    status = db.Column(db.String(20), default="success")
    detail = db.Column(db.String(400), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SystemSetting(db.Model):
    __tablename__ = "system_settings"

    key = db.Column(db.String(80), primary_key=True)
    value = db.Column(db.JSON, default=dict)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScheduledJob(db.Model):
    __tablename__ = "scheduled_jobs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), nullable=False)
    cron_expr = db.Column(db.String(80), nullable=False)
    enabled = db.Column(db.Boolean, default=False)
    last_run_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    text = db.Column(db.Text, default="", nullable=False)
    read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class PasswordRequest(db.Model):
    __tablename__ = "password_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), nullable=True)
    email = db.Column(db.String(255), nullable=False)
    # Fernet ciphertext of the requested password (at-rest encryption via APP_ENCRYPTION_KEY).
    # Not a one-way hash: decrypted on approve for Supabase admin.update_user, then wiped.
    password_enc = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending", nullable=False)  # pending|approved|rejected
    reviewer_id = db.Column(GUID(), db.ForeignKey("profiles.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime)


class WebAuthnCredential(db.Model):
    __tablename__ = "webauthn_credentials"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    credential_id = db.Column(db.Text, unique=True, nullable=False)
    public_key = db.Column(db.Text, nullable=False)
    sign_count = db.Column(db.Integer, default=0, nullable=False)
    transports = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_used_at = db.Column(db.DateTime)


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(60), unique=True, nullable=False)
    label = db.Column(db.String(120), nullable=False)
    permissions = db.Column(db.JSON, default=dict)
    is_builtin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
