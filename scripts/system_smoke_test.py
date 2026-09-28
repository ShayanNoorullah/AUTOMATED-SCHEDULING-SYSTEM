"""
End-to-end smoke test for SSIES portals (auth, redirects, CRUD, workflows).
Creates ephemeral users via Supabase admin, exercises APIs, then cleans up.
Does not print secrets. Exit 0 = all pass.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:5000").rstrip("/")
SUFFIX = uuid.uuid4().hex[:8]
PW = f"SmokeTest!{SUFFIX}Aa1"
RESULTS: list[tuple[str, bool, str]] = []


def load_run_local():
    path = ROOT / "run.local.bat"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.lower().startswith("set ") or "=" not in s:
            continue
        body = s[4:]
        key, _, val = body.partition("=")
        key, val = key.strip(), val.strip().strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def ok(name: str, cond: bool, detail: str = ""):
    RESULTS.append((name, bool(cond), detail))
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))


def req(method: str, path: str, session: requests.Session | None = None, **kw):
    s = session or requests
    return s.request(method, BASE + path, timeout=30, **kw)


def expect_status(name: str, r: requests.Response, codes: int | tuple[int, ...], detail: str = ""):
    if isinstance(codes, int):
        codes = (codes,)
    ok(name, r.status_code in codes, detail or f"got {r.status_code}")
    return r.status_code in codes


def supabase_sign_in(email: str, password: str) -> dict[str, Any]:
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password"
    r = requests.post(
        url,
        headers={
            "apikey": os.environ["SUPABASE_ANON_KEY"],
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def flask_login(email: str, password: str) -> requests.Session:
    tokens = supabase_sign_in(email, password)
    s = requests.Session()
    r = s.post(
        BASE + "/auth/session",
        json={
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token", ""),
        },
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    s._smoke_redirect = data.get("redirect")  # type: ignore[attr-defined]
    return s


def create_auth_user(email: str, password: str, role: str, display: str):
    """Create via app service (needs Flask app context)."""
    from app import create_app
    from app.models import Profile, db
    from app.services.users import create_user, delete_user

    app = create_app()
    with app.app_context():
        existing = Profile.query.filter_by(email=email).first()
        if existing:
            # wipe prior smoke leftovers
            actor = Profile.query.filter_by(role="superadmin").first()
            if actor:
                try:
                    delete_user(existing, actor)
                except Exception:
                    pass
        p = create_user(email, password, display_name=display, role=role)
        return str(p.id)


def promote_to_superadmin(user_id: str):
    from app import create_app
    from app.models import Profile, db
    import uuid as _uuid
    app = create_app()
    with app.app_context():
        p = db.session.get(Profile, _uuid.UUID(user_id))
        if not p:
            raise RuntimeError("profile missing")
        p.role = "superadmin"
        db.session.commit()


def demote_from_superadmin(user_id: str, role: str = "user"):
    from app import create_app
    from app.models import Profile, db
    import uuid as _uuid
    app = create_app()
    with app.app_context():
        p = db.session.get(Profile, _uuid.UUID(user_id))
        if p and p.role == "superadmin":
            p.role = role
            db.session.commit()


def delete_auth_user(user_id: str):
    from app import create_app
    from app.models import Profile, db
    from app.services.users import delete_user

    app = create_app()
    with app.app_context():
        target = db.session.get(Profile, uuid.UUID(user_id))
        actor = Profile.query.filter_by(role="superadmin").first()
        if target and actor and actor.id != target.id:
            delete_user(target, actor)
        elif target:
            from app.auth.decorators import get_supabase_admin
            from app.models import (
                Group, Contact, Template, ReleaseLog, ScheduledJob,
                Notification, PasswordRequest, WebAuthnCredential, AuditLog,
            )
            Group.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            Contact.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            Template.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            ReleaseLog.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            ScheduledJob.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            Notification.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            WebAuthnCredential.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            PasswordRequest.query.filter_by(user_id=target.id).delete(synchronize_session=False)
            try:
                get_supabase_admin().auth.admin.delete_user(user_id)
            except Exception:
                pass
            db.session.delete(target)
            db.session.commit()


def page_checks():
    print("\n== Unauthenticated pages / redirects ==")
    r = req("GET", "/login", allow_redirects=False)
    expect_status("GET /login", r, 200)

    r = req("GET", "/auth/forgot-password", allow_redirects=False)
    expect_status("GET /auth/forgot-password", r, 200)

    for path in ("/", "/profile", "/admin", "/superadmin", "/api/groups", "/api/auth/me"):
        r = req("GET", path, allow_redirects=False)
        ok(
            f"unauth {path} blocked",
            r.status_code in (302, 401, 403) or (r.status_code == 200 and "login" in (r.headers.get("Location") or "").lower()),
            f"status={r.status_code} loc={r.headers.get('Location','')}",
        )

    r = req("GET", "/health")
    expect_status("GET /health", r, 200)
    try:
        ok("health ok payload", r.json().get("status") == "ok")
    except Exception as e:
        ok("health ok payload", False, str(e))


def test_user_crud(session: requests.Session):
    print("\n== User portal CRUD ==")
    r = session.get(BASE + "/api/auth/me")
    expect_status("GET /api/auth/me", r, 200)
    me = r.json() if r.ok else {}
    ok("me has role user", me.get("role") == "user", str(me.get("role")))

    r = session.get(BASE + "/", allow_redirects=False)
    expect_status("GET / dashboard", r, 200)

    for view in ("dashboard", "groups", "contacts", "table", "wa-direct", "wa-auto", "templates", "history", "settings"):
        r = session.get(BASE + f"/?view={view}", allow_redirects=False)
        expect_status(f"GET /?view={view}", r, 200)

    r = session.get(BASE + "/?view=table&sched=board", allow_redirects=False)
    expect_status("GET /?view=table&sched=board", r, 200)
    ok("boot view param in HTML", "view=table" in r.text or "Scheduler" in r.text or "boot" in r.text)

    r = session.get(BASE + "/profile", allow_redirects=False)
    expect_status("GET /profile", r, 200)
    ok("profile scroll CSS class", "profile-content-wrap" in r.text)
    ok("profile rail links use ?view=", "/?view=groups" in r.text)

    # Groups CRUD
    g_body = {
        "name": f"Smoke Group {SUFFIX}",
        "inviteLink": "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt",
        "schedule": [{"day": "Mon", "from": "09:00", "to": "10:00"}],
        "message": "Hello {group}",
    }
    r = session.post(BASE + "/api/groups", json=g_body)
    expect_status("POST /api/groups", r, (200, 201))
    groups = session.get(BASE + "/api/groups").json()
    ok("group list has smoke group", any(g.get("name") == g_body["name"] for g in groups), f"n={len(groups)}")
    idx = next((i for i, g in enumerate(groups) if g.get("name") == g_body["name"]), None)
    if idx is not None:
        r = session.put(BASE + f"/api/groups/{idx}", json={**g_body, "name": g_body["name"] + " U"})
        expect_status("PUT /api/groups/:idx", r, 200)
        r = session.delete(BASE + f"/api/groups/{idx}")
        expect_status("DELETE /api/groups/:idx", r, 200)

    # Contacts CRUD
    c_body = {"name": f"Smoke Contact {SUFFIX}", "phone": "+15550001111", "message": "Hi {name}"}
    r = session.post(BASE + "/api/contacts", json=c_body)
    expect_status("POST /api/contacts", r, (200, 201))
    contacts = session.get(BASE + "/api/contacts").json()
    ok("contact created", any(c.get("name") == c_body["name"] for c in contacts))
    cidx = next((i for i, c in enumerate(contacts) if c.get("name") == c_body["name"]), None)
    if cidx is not None:
        r = session.put(BASE + f"/api/contacts/{cidx}", json={**c_body, "name": c_body["name"] + " U"})
        expect_status("PUT /api/contacts/:idx", r, 200)
        r = session.delete(BASE + f"/api/contacts/{cidx}")
        expect_status("DELETE /api/contacts/:idx", r, 200)

    # Templates CRUD
    t_body = {"name": f"Smoke Tpl {SUFFIX}", "content": "Class at {time}"}
    r = session.post(BASE + "/api/templates", json=t_body)
    expect_status("POST /api/templates", r, (200, 201))
    templates = session.get(BASE + "/api/templates").json()
    ok("template list non-empty", isinstance(templates, list) and len(templates) >= 1)
    tidx = next((i for i, t in enumerate(templates) if t.get("name") == t_body["name"]), None)
    if tidx is not None:
        r = session.put(BASE + f"/api/templates/{tidx}", json={**t_body, "content": "Updated {time}"})
        expect_status("PUT /api/templates/:idx", r, 200)
        r = session.delete(BASE + f"/api/templates/{tidx}")
        expect_status("DELETE /api/templates/:idx", r, 200)

    # Settings + notes
    r = session.get(BASE + "/api/settings")
    expect_status("GET /api/settings", r, 200)
    r = session.put(BASE + "/api/settings", json={"delaySeconds": 7, "headless": True})
    expect_status("PUT /api/settings", r, 200)

    r = session.get(BASE + "/api/scheduler/notes")
    expect_status("GET /api/scheduler/notes", r, 200)
    r = session.put(BASE + "/api/scheduler/notes", json={"notes": f"smoke note {SUFFIX}"})
    expect_status("PUT /api/scheduler/notes", r, 200)

    r = session.get(BASE + "/api/release-history")
    expect_status("GET /api/release-history", r, 200)

    r = session.get(BASE + "/api/whatsapp/status")
    expect_status("GET /api/whatsapp/status", r, (200, 503))

    r = session.get(BASE + "/api/notifications")
    expect_status("GET /api/notifications", r, 200)

    # Profile update
    r = session.put(BASE + "/api/profile", json={"displayName": f"Smoke User {SUFFIX}"})
    expect_status("PUT /api/profile", r, 200)

    # Password request workflow (non-superadmin)
    r = session.post(BASE + "/api/profile/password-request", json={"current": PW, "password": PW + "x"})
    expect_status("POST /api/profile/password-request", r, (200, 201, 400, 409))
    r = session.get(BASE + "/api/profile/password-request")
    expect_status("GET /api/profile/password-request", r, 200)

    # Role isolation: user cannot hit admin APIs
    r = session.get(BASE + "/admin/api/users", allow_redirects=False)
    ok("user blocked from admin API", r.status_code in (302, 401, 403), f"status={r.status_code}")
    r = session.get(BASE + "/superadmin/api/users", allow_redirects=False)
    ok("user blocked from superadmin API", r.status_code in (302, 401, 403), f"status={r.status_code}")


def test_admin(session: requests.Session, user_email: str):
    print("\n== Admin portal ==")
    redir = getattr(session, "_smoke_redirect", None)
    ok("admin login redirect", redir == "/admin", f"got {redir}")

    for path in ("/admin/", "/admin/users", "/admin/activity", "/admin/profile"):
        r = session.get(BASE + path, allow_redirects=True)
        expect_status(f"GET {path}", r, 200)
    r = session.get(BASE + "/admin", allow_redirects=True)
    expect_status("GET /admin (no trailing slash)", r, 200)

    ok("admin profile scroll wrap", "profile-content-wrap" in session.get(BASE + "/admin/profile").text)

    r = session.get(BASE + "/admin/api/stats")
    expect_status("GET /admin/api/stats", r, 200)
    r = session.get(BASE + "/admin/api/insights")
    expect_status("GET /admin/api/insights", r, 200)
    r = session.get(BASE + "/admin/api/activity")
    expect_status("GET /admin/api/activity", r, 200)
    r = session.get(BASE + "/admin/api/users")
    expect_status("GET /admin/api/users", r, 200)
    users = r.json() if r.ok else []
    if isinstance(users, dict):
        users = users.get("users") or users.get("items") or []

    # Create + update + disable + delete a managed user
    managed_email = f"smoke.managed.{SUFFIX}@example.com"
    managed_pw = PW + "M"
    r = session.post(
        BASE + "/admin/api/users",
        json={"email": managed_email, "password": managed_pw, "displayName": "Managed Smoke"},
    )
    expect_status("POST /admin/api/users", r, (200, 201))
    created = r.json() if r.ok else {}
    uid = created.get("id") or created.get("user", {}).get("id")
    if not uid:
        # resolve from list
        users = session.get(BASE + "/admin/api/users").json()
        if isinstance(users, dict):
            users = users.get("users") or users.get("items") or []
        uid = next((u.get("id") for u in users if u.get("email") == managed_email), None)
    ok("admin created user id", bool(uid), str(created)[:120])

    if uid:
        r = session.get(BASE + f"/admin/users/{uid}", allow_redirects=False)
        expect_status("GET /admin/users/:id page", r, 200)
        r = session.get(BASE + f"/admin/api/users/{uid}")
        expect_status("GET /admin/api/users/:id", r, 200)
        r = session.put(BASE + f"/admin/api/users/{uid}", json={"displayName": "Managed Smoke U", "isActive": False})
        expect_status("PUT /admin/api/users/:id disable", r, 200)
        r = session.put(BASE + f"/admin/api/users/{uid}", json={"isActive": True})
        expect_status("PUT /admin/api/users/:id re-enable", r, 200)
        r = session.delete(BASE + f"/admin/api/users/{uid}")
        expect_status("DELETE /admin/api/users/:id", r, 200)

    # Admin can use user dashboard too
    r = session.get(BASE + "/", allow_redirects=False)
    expect_status("admin can open user dashboard", r, 200)


def test_superadmin(session: requests.Session):
    print("\n== Superadmin portal ==")
    redir = getattr(session, "_smoke_redirect", None)
    ok("superadmin login redirect", redir == "/superadmin", f"got {redir}")

    for path in (
        "/superadmin/",
        "/superadmin/users",
        "/superadmin/admins",
        "/superadmin/roles",
        "/superadmin/settings",
        "/superadmin/audit",
        "/superadmin/profile",
    ):
        r = session.get(BASE + path, allow_redirects=True)
        expect_status(f"GET {path}", r, 200)

    r = session.get(BASE + "/superadmin/api/stats")
    expect_status("GET /superadmin/api/stats", r, 200)
    r = session.get(BASE + "/superadmin/api/users")
    expect_status("GET /superadmin/api/users", r, 200)
    r = session.get(BASE + "/superadmin/api/admins")
    expect_status("GET /superadmin/api/admins", r, 200)
    r = session.get(BASE + "/superadmin/api/settings")
    expect_status("GET /superadmin/api/settings", r, 200)
    r = session.get(BASE + "/superadmin/api/audit")
    expect_status("GET /superadmin/api/audit", r, 200)
    r = session.get(BASE + "/superadmin/api/waha/health")
    expect_status("GET /superadmin/api/waha/health", r, (200, 502, 503))

    # Roles API (poc parity)
    r = session.get(BASE + "/api/roles")
    expect_status("GET /api/roles", r, (200, 404))

    # Create admin via superadmin
    admin_email = f"smoke.admin2.{SUFFIX}@example.com"
    r = session.post(
        BASE + "/superadmin/api/admins",
        json={"email": admin_email, "password": PW + "A", "displayName": "Smoke Admin2"},
    )
    expect_status("POST /superadmin/api/admins", r, (200, 201))
    created = r.json() if r.ok else {}
    uid = created.get("id") or created.get("user", {}).get("id")
    if not uid:
        admins = session.get(BASE + "/superadmin/api/admins").json()
        if isinstance(admins, dict):
            admins = admins.get("admins") or admins.get("users") or admins.get("items") or []
        uid = next((u.get("id") for u in admins if u.get("email") == admin_email), None)
    ok("superadmin created admin id", bool(uid))
    if uid:
        r = session.get(BASE + f"/superadmin/inspect/{uid}", allow_redirects=False)
        expect_status("GET /superadmin/inspect/:id", r, 200)
        r = session.put(BASE + f"/superadmin/api/users/{uid}/role", json={"role": "user"})
        expect_status("PUT role admin->user", r, 200)
        r = session.delete(BASE + f"/superadmin/api/users/{uid}")
        expect_status("DELETE smoke admin", r, 200)

    # Create user via superadmin users API
    u_email = f"smoke.sa.user.{SUFFIX}@example.com"
    r = session.post(
        BASE + "/superadmin/api/users",
        json={"email": u_email, "password": PW + "U", "displayName": "SA User", "role": "user"},
    )
    expect_status("POST /superadmin/api/users", r, (200, 201))
    created = r.json() if r.ok else {}
    uid = created.get("id") or created.get("user", {}).get("id")
    if uid:
        r = session.delete(BASE + f"/superadmin/api/users/{uid}")
        expect_status("DELETE /superadmin/api/users smoke", r, 200)


def test_logout(session: requests.Session):
    print("\n== Logout ==")
    r = session.get(BASE + "/logout", allow_redirects=False)
    ok("logout redirects to login", r.status_code in (302, 303) and "/login" in (r.headers.get("Location") or ""), f"status={r.status_code}")
    r = session.get(BASE + "/api/auth/me", allow_redirects=False)
    ok("post-logout /api/auth/me blocked", r.status_code in (302, 401, 403), f"status={r.status_code}")


def main() -> int:
    load_run_local()
    # Ensure Flask can import with same env
    sys.path.insert(0, str(ROOT))

    print(f"SSIES system smoke test -> {BASE}")
    try:
        req("GET", "/health").raise_for_status()
    except Exception as e:
        print(f"Server not reachable at {BASE}: {e}")
        return 2

    page_checks()

    user_email = f"smoke.user.{SUFFIX}@example.com"
    admin_email = f"smoke.admin.{SUFFIX}@example.com"
    ids: list[str] = []

    print("\n== Provision ephemeral accounts ==")
    try:
        uid = create_auth_user(user_email, PW, "user", "Smoke User")
        ids.append(uid)
        ok("create smoke user", True, user_email)
    except Exception as e:
        ok("create smoke user", False, str(e))
        uid = None

    try:
        aid = create_auth_user(admin_email, PW, "admin", "Smoke Admin")
        ids.append(aid)
        ok("create smoke admin", True, admin_email)
    except Exception as e:
        ok("create smoke admin", False, str(e))
        aid = None

    # Ephemeral superadmin (promote a dedicated smoke user) — avoids needing real SA password
    sa_email = f"smoke.sa.{SUFFIX}@example.com"
    said = None
    sa_session = None
    try:
        said = create_auth_user(sa_email, PW, "admin", "Smoke SA")
        ids.append(said)
        promote_to_superadmin(said)
        ok("create ephemeral superadmin", True, sa_email)
        sa_session = flask_login(sa_email, PW)
        ok("login ephemeral superadmin", True)
        ok(
            "superadmin redirect",
            getattr(sa_session, "_smoke_redirect", None) == "/superadmin",
            str(getattr(sa_session, "_smoke_redirect", None)),
        )
    except Exception as e:
        ok("create/login ephemeral superadmin", False, str(e))
        sa_session = None

    # Optional: also exercise real SUPERADMIN_EMAIL if password provided
    real_sa_email = (os.environ.get("SUPERADMIN_EMAIL") or "").strip().lower()
    real_sa_pw = os.environ.get("SMOKE_SUPER_PASSWORD", "").strip()
    if real_sa_email and real_sa_pw:
        try:
            flask_login(real_sa_email, real_sa_pw)
            ok("login existing superadmin", True)
        except Exception as e:
            ok("login existing superadmin", False, str(e))

    user_session = None
    admin_session = None
    if uid:
        try:
            user_session = flask_login(user_email, PW)
            ok("login smoke user", True)
            ok("user redirect", getattr(user_session, "_smoke_redirect", None) == "/", str(getattr(user_session, "_smoke_redirect", None)))
        except Exception as e:
            ok("login smoke user", False, str(e))

    if aid:
        try:
            admin_session = flask_login(admin_email, PW)
            ok("login smoke admin", True)
        except Exception as e:
            ok("login smoke admin", False, str(e))

    if user_session:
        test_user_crud(user_session)
        test_logout(user_session)

    if admin_session:
        test_admin(admin_session, user_email)
        test_logout(admin_session)

    if sa_session:
        test_superadmin(sa_session)
        test_logout(sa_session)

    print("\n== Cleanup ephemeral accounts ==")
    if said:
        try:
            demote_from_superadmin(said, "admin")
        except Exception:
            pass
    for i in ids:
        try:
            delete_auth_user(i)
            ok(f"cleanup {i[:8]}...", True)
        except Exception as e:
            ok(f"cleanup {i[:8]}...", False, str(e))

    passed = sum(1 for _, c, _ in RESULTS if c)
    failed = sum(1 for _, c, _ in RESULTS if not c)
    print(f"\n{'=' * 48}\nResults: {passed} passed, {failed} failed, {len(RESULTS)} total")
    if failed:
        print("\nFailures:")
        for name, c, detail in RESULTS:
            if not c:
                print(f"  - {name}: {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
