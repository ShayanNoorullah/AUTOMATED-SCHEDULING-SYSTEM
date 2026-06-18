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
    role = db.Column(db.String(20), nullable=False, default="user")
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    headless = db.Column(db.Boolean, default=False)
    delay_seconds = db.Column(db.Integer, default=5)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)

    def is_superadmin(self):
        return self.role == "superadmin"

    def is_admin(self):
        return self.role in ("admin", "superadmin")

    def display_label(self):
        return self.display_name or self.email.split("@")[0]


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(GUID(), db.ForeignKey("profiles.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    schedule = db.Column(db.JSON, default=list)
    message_enc = db.Column(db.Text, default="")
    last_released = db.Column(db.String(40), default="")
    invite_link = db.Column(db.Text, default="")
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
