"""WhatsApp Schedule Sender — Flask app with PostgreSQL/SQLite storage,
multi-user accounts, encryption at rest, login rate-limiting, sessions and audit log."""
import os, json, time, threading, queue, secrets, base64
from functools import wraps
from datetime import datetime, timedelta

from flask import (Flask, request, jsonify, render_template, Response,
                   session, redirect)
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet, InvalidToken

from whatsapp_sender import send_to_target

BASE = os.path.dirname(os.path.abspath(__file__))
INSTANCE = os.path.join(BASE, "instance")
os.makedirs(INSTANCE, exist_ok=True)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

app = Flask(__name__)

# ── Database URL (cloud Postgres via DATABASE_URL, else local SQLite) ─────────
db_url = os.environ.get("DATABASE_URL", "").strip()
if db_url.startswith("postgres://"):          # normalise old-style scheme
    db_url = db_url.replace("postgres://", "postgresql://", 1)
if not db_url:
    db_url = "sqlite:///" + os.path.join(INSTANCE, "app.db")
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}

# ── Secret key (persisted so sessions survive restarts) ──────────────────────
def _persisted(name, factory):
    path = os.path.join(INSTANCE, name)
    if os.path.exists(path):
        return open(path).read().strip()
    val = factory()
    with open(path, "w") as f:
        f.write(val)
    return val

app.secret_key = os.environ.get("APP_SECRET_KEY") or _persisted("secret.key", lambda: secrets.token_hex(32))

# ── Session hardening ─────────────────────────────────────────────────────────
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("FORCE_HTTPS") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)

# ── Encryption at rest (Fernet). Key must match across devices to decrypt. ───
_key = os.environ.get("APP_ENCRYPTION_KEY") or _persisted("enc.key", lambda: Fernet.generate_key().decode())
try:
    fernet = Fernet(_key.encode() if isinstance(_key, str) else _key)
except Exception:
    fernet = Fernet(base64.urlsafe_b64encode(_key.encode()[:32].ljust(32, b"0")))

def enc(text):
    if not text:
        return ""
    return fernet.encrypt(text.encode()).decode()

def dec(token):
    if not token:
        return ""
    try:
        return fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return token   # tolerate legacy plaintext

db = SQLAlchemy(app)

status_queue = queue.Queue()
release_lock = threading.Lock()
DEFAULT_DELAY = 5


# ── Models ────────────────────────────────────────────────────────────────────
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    headless = db.Column(db.Boolean, default=False)
    delay_seconds = db.Column(db.Integer, default=DEFAULT_DELAY)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    schedule = db.Column(db.JSON, default=list)
    message_enc = db.Column(db.Text, default="")
    last_released = db.Column(db.String(40), default="")
    position = db.Column(db.Integer, default=0)

class Template(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    content_enc = db.Column(db.Text, default="")
    position = db.Column(db.Integer, default=0)

class Contact(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), index=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    phone_enc = db.Column(db.Text, default="")
    message_enc = db.Column(db.Text, default="")
    last_released = db.Column(db.String(40), default="")
    position = db.Column(db.Integer, default=0)

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, index=True)
    action = db.Column(db.String(60))
    detail = db.Column(db.String(400))
    ip = db.Column(db.String(60))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

with app.app_context():
    db.create_all()


# ── Serialization (decrypt on the way out) ────────────────────────────────────
def group_dict(g):
    return {"name": g.name, "schedule": g.schedule or [],
            "message": dec(g.message_enc), "lastReleased": g.last_released or ""}
def template_dict(t):
    return {"name": t.name, "content": dec(t.content_enc)}
def contact_dict(c):
    return {"name": c.name, "phone": dec(c.phone_enc),
            "message": dec(c.message_enc), "lastReleased": c.last_released or ""}


# ── Auth helpers + rate limiting ──────────────────────────────────────────────
_login_attempts = {}          # ip -> [timestamps of failures]
LOCK_THRESHOLD, LOCK_WINDOW = 5, 300   # 5 fails / 5 min

def _client_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()

def _too_many_attempts(ip):
    now = time.time()
    fails = [t for t in _login_attempts.get(ip, []) if now - t < LOCK_WINDOW]
    _login_attempts[ip] = fails
    return len(fails) >= LOCK_THRESHOLD

def _record_fail(ip):
    _login_attempts.setdefault(ip, []).append(time.time())

def current_user():
    uid = session.get("uid")
    return db.session.get(User, uid) if uid else None

def audit(action, detail="", user_id=None):
    try:
        db.session.add(AuditLog(user_id=user_id or session.get("uid"),
                                action=action, detail=detail[:400], ip=_client_ip()))
        db.session.commit()
    except Exception:
        db.session.rollback()

def has_users():
    return db.session.query(User.id).first() is not None

PUBLIC = {"login_page", "auth_signup", "auth_login", "static"}

@app.before_request
def _guard():
    if request.endpoint in PUBLIC:
        return
    if not session.get("uid"):
        if request.path.startswith("/api/"):
            return jsonify({"error": "unauthorized"}), 401
        return redirect("/login")


# ── Message helpers ────────────────────────────────────────────────────────────
def fmt_time(e):
    f, t = (e.get("from", "") or "").strip(), (e.get("to", "") or "").strip()
    if f and t: return f"{f} - {t}"
    if f: return f
    return e.get("time", "")

def format_message(schedule):
    lines = ["*Note*", "Schedule for this week:", ""]
    for e in schedule or []:
        lines.append(f"* {e['day']}: {fmt_time(e)}")
    lines.append("*Kindly Acknowledge*")
    return "\n".join(lines)


# ── Auth routes ────────────────────────────────────────────────────────────────
@app.route("/login")
def login_page():
    if session.get("uid"):
        return redirect("/")
    # setup mode when there are no users yet (first run = create account)
    return render_template("login.html", setup=(not has_users()))

@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    data = request.json or {}
    u = (data.get("username") or "").strip()
    p = data.get("password") or ""
    if len(u) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if len(p) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if User.query.filter(db.func.lower(User.username) == u.lower()).first():
        return jsonify({"error": "That username is taken"}), 409
    user = User(username=u, password_hash=generate_password_hash(p))
    db.session.add(user); db.session.commit()
    session.permanent = True
    session["uid"] = user.id
    audit("signup", f"user={u}", user_id=user.id)
    _maybe_import_legacy(user.id)
    if not Template.query.filter_by(user_id=user.id).first():
        _seed_default_template(user.id)
        db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    ip = _client_ip()
    if _too_many_attempts(ip):
        return jsonify({"error": "Too many attempts. Try again in a few minutes."}), 429
    data = request.json or {}
    u = (data.get("username") or "").strip()
    p = data.get("password") or ""
    remember = bool(data.get("remember"))
    user = User.query.filter(db.func.lower(User.username) == u.lower()).first()
    if user and check_password_hash(user.password_hash, p):
        _login_attempts.pop(ip, None)
        session.permanent = remember
        session["uid"] = user.id
        audit("login", f"user={u}", user_id=user.id)
        return jsonify({"ok": True})
    _record_fail(ip)
    audit("login_failed", f"user={u}")
    return jsonify({"error": "Incorrect username or password"}), 401

@app.route("/api/auth/change", methods=["POST"])
def auth_change():
    data = request.json or {}
    user = current_user()
    if not check_password_hash(user.password_hash, data.get("current") or ""):
        return jsonify({"error": "Current password is incorrect"}), 401
    if len((data.get("new") or "")) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400
    user.password_hash = generate_password_hash(data["new"])
    db.session.commit()
    audit("password_change")
    return jsonify({"ok": True})

@app.route("/logout")
def logout():
    audit("logout")
    session.clear()
    return redirect("/login")


# ── One-time import of an existing groups_config.json into a new account ──────
def _maybe_import_legacy(user_id):
    path = os.path.join(BASE, "groups_config.json")
    if not os.path.exists(path):
        return
    try:
        data = json.load(open(path))
    except Exception:
        return
    for i, g in enumerate(data.get("groups", [])):
        db.session.add(Group(user_id=user_id, name=g.get("name", ""), schedule=g.get("schedule", []),
                             message_enc=enc(g.get("message", "")), last_released=g.get("lastReleased", ""), position=i))
    for i, t in enumerate(data.get("templates", [])):
        db.session.add(Template(user_id=user_id, name=t.get("name", ""), content_enc=enc(t.get("content", "")), position=i))
    for i, c in enumerate(data.get("contacts", [])):
        db.session.add(Contact(user_id=user_id, name=c.get("name", ""), phone_enc=enc(str(c.get("phone", ""))),
                              message_enc=enc(c.get("message", "")), position=i))
    s = data.get("settings", {})
    u = db.session.get(User, user_id)
    u.headless = bool(s.get("headless", False)); u.delay_seconds = int(s.get("delaySeconds", DEFAULT_DELAY))
    # seed the default schedule template if user has none
    if not Template.query.filter_by(user_id=user_id).first():
        _seed_default_template(user_id)
    db.session.commit()

def _seed_default_template(user_id):
    default = ("*Note*\nSchedule for this week:\n\n"
               "* Saturday: 12:00pm - 1:30pm\n* Sunday: 12:00pm - 1:30pm\n\n*Kindly Acknowledge*")
    db.session.add(Template(user_id=user_id, name="Weekly Schedule (default)", content_enc=enc(default), position=0))


def _digits(s):
    return "".join(ch for ch in str(s or "") if ch.isdigit())


# ── Index ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", days=DAYS, username=current_user().username)


# ── Groups ──────────────────────────────────────────────────────────────────────
@app.route("/api/groups", methods=["GET"])
def get_groups():
    uid = session["uid"]
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    return jsonify([group_dict(g) for g in rows])

@app.route("/api/groups", methods=["POST"])
def add_group():
    data = request.json or {}
    uid = session["uid"]
    if not data.get("name") or not data.get("schedule"):
        return jsonify({"error": "name and schedule required"}), 400
    if Group.query.filter_by(user_id=uid, name=data["name"]).first():
        return jsonify({"error": "Group name already exists"}), 409
    n = Group.query.filter_by(user_id=uid).count()
    db.session.add(Group(user_id=uid, name=data["name"], schedule=data["schedule"],
                         message_enc=enc(data.get("message", "")),
                         last_released=data.get("lastReleased", ""), position=n))
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/groups/<int:idx>", methods=["PUT"])
def update_group(idx):
    data = request.json or {}
    uid = session["uid"]
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    g = rows[idx]
    g.name = data["name"]; g.schedule = data["schedule"]; g.message_enc = enc(data.get("message", ""))
    g.last_released = data.get("lastReleased", g.last_released)
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/groups", methods=["PUT"])
def replace_all_groups():
    data = request.json or {}
    uid = session["uid"]
    groups = data.get("groups")
    if groups is None:
        return jsonify({"error": "groups list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    for i, g in enumerate(groups):
        db.session.add(Group(user_id=uid, name=g.get("name", ""), schedule=g.get("schedule", []),
                             message_enc=enc(g.get("message", "")), last_released=g.get("lastReleased", ""), position=i))
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/groups/<int:idx>", methods=["DELETE"])
def delete_group(idx):
    uid = session["uid"]
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx]); db.session.commit()
    return jsonify({"ok": True})


# ── Templates ────────────────────────────────────────────────────────────────
@app.route("/api/templates", methods=["GET"])
def get_templates():
    rows = Template.query.filter_by(user_id=session["uid"]).order_by(Template.position, Template.id).all()
    return jsonify([template_dict(t) for t in rows])

@app.route("/api/templates", methods=["POST"])
def add_template():
    data = request.json or {}
    uid = session["uid"]
    if not data.get("name"):
        return jsonify({"error": "Template name required"}), 400
    n = Template.query.filter_by(user_id=uid).count()
    db.session.add(Template(user_id=uid, name=data["name"], content_enc=enc(data.get("content", "")), position=n))
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/templates/<int:idx>", methods=["PUT"])
def update_template(idx):
    data = request.json or {}
    rows = Template.query.filter_by(user_id=session["uid"]).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    rows[idx].name = data["name"]; rows[idx].content_enc = enc(data.get("content", ""))
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/templates/<int:idx>", methods=["DELETE"])
def delete_template(idx):
    rows = Template.query.filter_by(user_id=session["uid"]).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx]); db.session.commit()
    return jsonify({"ok": True})


# ── Contacts ─────────────────────────────────────────────────────────────────
@app.route("/api/contacts", methods=["GET"])
def get_contacts():
    rows = Contact.query.filter_by(user_id=session["uid"]).order_by(Contact.position, Contact.id).all()
    return jsonify([contact_dict(c) for c in rows])

@app.route("/api/contacts", methods=["POST"])
def add_contact():
    data = request.json or {}
    uid = session["uid"]
    if not data.get("name") or not _digits(data.get("phone")):
        return jsonify({"error": "Contact name and phone required"}), 400
    n = Contact.query.filter_by(user_id=uid).count()
    db.session.add(Contact(user_id=uid, name=data["name"], phone_enc=enc(_digits(data.get("phone"))),
                          message_enc=enc(data.get("message", "")), position=n))
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/contacts/<int:idx>", methods=["PUT"])
def update_contact(idx):
    data = request.json or {}
    rows = Contact.query.filter_by(user_id=session["uid"]).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    c = rows[idx]
    c.name = data["name"]; c.phone_enc = enc(_digits(data.get("phone")))
    c.message_enc = enc(data.get("message", "")); c.last_released = data.get("lastReleased", c.last_released)
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/contacts/<int:idx>", methods=["DELETE"])
def delete_contact(idx):
    rows = Contact.query.filter_by(user_id=session["uid"]).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx]); db.session.commit()
    return jsonify({"ok": True})


# ── Settings ─────────────────────────────────────────────────────────────────
@app.route("/api/settings", methods=["GET"])
def get_settings():
    u = current_user()
    return jsonify({"headless": u.headless, "delaySeconds": u.delay_seconds})

@app.route("/api/settings", methods=["PUT"])
def update_settings():
    data = request.json or {}
    u = current_user()
    if "headless" in data: u.headless = bool(data["headless"])
    if "delaySeconds" in data:
        try: u.delay_seconds = max(0, int(data["delaySeconds"]))
        except (ValueError, TypeError): pass
    db.session.commit()
    return jsonify({"headless": u.headless, "delaySeconds": u.delay_seconds})


# ── Audit log ────────────────────────────────────────────────────────────────
@app.route("/api/audit", methods=["GET"])
def get_audit():
    rows = (AuditLog.query.filter_by(user_id=session["uid"])
            .order_by(AuditLog.created_at.desc()).limit(100).all())
    return jsonify([{"action": r.action, "detail": r.detail, "ip": r.ip,
                     "at": r.created_at.isoformat(timespec="seconds")} for r in rows])


# ── Config export / import (per user) ────────────────────────────────────────
@app.route("/api/config", methods=["GET"])
def export_config():
    uid = session["uid"]; u = current_user()
    return jsonify({
        "groups": [group_dict(g) for g in Group.query.filter_by(user_id=uid).order_by(Group.position).all()],
        "templates": [template_dict(t) for t in Template.query.filter_by(user_id=uid).order_by(Template.position).all()],
        "contacts": [contact_dict(c) for c in Contact.query.filter_by(user_id=uid).order_by(Contact.position).all()],
        "settings": {"headless": u.headless, "delaySeconds": u.delay_seconds},
    })

@app.route("/api/config", methods=["PUT"])
def import_config():
    data = request.json or {}
    uid = session["uid"]
    if "groups" not in data or not isinstance(data["groups"], list):
        return jsonify({"error": "Invalid config: 'groups' list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    Template.query.filter_by(user_id=uid).delete()
    Contact.query.filter_by(user_id=uid).delete()
    for i, g in enumerate(data.get("groups", [])):
        db.session.add(Group(user_id=uid, name=g.get("name", ""), schedule=g.get("schedule", []),
                             message_enc=enc(g.get("message", "")), last_released=g.get("lastReleased", ""), position=i))
    for i, t in enumerate(data.get("templates", [])):
        db.session.add(Template(user_id=uid, name=t.get("name", ""), content_enc=enc(t.get("content", "")), position=i))
    for i, c in enumerate(data.get("contacts", [])):
        db.session.add(Contact(user_id=uid, name=c.get("name", ""), phone_enc=enc(_digits(c.get("phone"))),
                              message_enc=enc(c.get("message", "")), position=i))
    s = data.get("settings", {})
    u = current_user()
    u.headless = bool(s.get("headless", u.headless)); u.delay_seconds = int(s.get("delaySeconds", u.delay_seconds))
    db.session.commit()
    audit("config_restore")
    return jsonify({"ok": True})


# ── Release ──────────────────────────────────────────────────────────────────
def _stamp(uid, name, phone=None):
    stamp = datetime.now().isoformat(timespec="seconds")
    for g in Group.query.filter_by(user_id=uid, name=name).all():
        g.last_released = stamp
    if phone:
        for c in Contact.query.filter_by(user_id=uid).all():
            if dec(c.phone_enc) == phone:
                c.last_released = stamp
    db.session.commit()

@app.route("/api/release", methods=["POST"])
def release():
    if not release_lock.acquire(blocking=False):
        return jsonify({"error": "Release already in progress"}), 409

    uid = session["uid"]
    u = current_user()
    headless, delay = u.headless, u.delay_seconds
    data = request.json or {}
    targets = data.get("targets")
    if not targets:
        rows = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        targets = [{"name": g.name, "message": dec(g.message_enc) or format_message(g.schedule)} for g in rows]
    targets = [t for t in targets if t.get("name") and (t.get("message", "") or "").strip()]
    if not targets:
        release_lock.release()
        return jsonify({"error": "Nothing to send"}), 400

    audit("release", f"{len(targets)} recipient(s)", user_id=uid)

    def log(msg):
        status_queue.put(msg)

    def worker():
        try:
            mode = " (headless)" if headless else ""
            log(f"info:── Releasing to {len(targets)} recipient(s){mode} ──")
            ok = 0
            for i, t in enumerate(targets):
                phone = t.get("phone")
                if send_to_target(t["name"], t["message"], headless=headless, phone=phone, log=log):
                    ok += 1
                    with app.app_context():
                        _stamp(uid, t["name"], phone)
                if delay and i < len(targets) - 1:
                    log(f"info:Waiting {delay}s before next recipient…")
                    time.sleep(delay)
            log(f"done:── Finished: {ok}/{len(targets)} sent ──")
        finally:
            release_lock.release()

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({"ok": True})

@app.route("/api/status")
def status_stream():
    def gen():
        while True:
            try:
                yield f"data: {status_queue.get(timeout=30)}\n\n"
            except queue.Empty:
                yield "data: ping\n\n"
    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    print("Starting WhatsApp Schedule Sender…")
    print("Database:", db_url.split("@")[-1] if "@" in db_url else db_url)
    print("Open your browser at: http://localhost:5000")
    app.run(debug=False, port=5000)
