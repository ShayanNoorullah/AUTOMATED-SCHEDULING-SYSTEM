"""Authenticated lists CRUD smoke using ephemeral Supabase user."""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:5001").rstrip("/")
SUFFIX = uuid.uuid4().hex[:6]
PW = f"SmokeList!{SUFFIX}Aa1"
EMAIL = f"smoke.lists.{SUFFIX}@example.com"
fails = 0


def load_env():
    for line in (ROOT / "run.local.bat").read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.lower().startswith("set ") or "=" not in s:
            continue
        body = s[4:]
        key, _, val = body.partition("=")
        key, val = key.strip(), val.strip().strip('"')
        if key:
            os.environ[key] = val


def check(name, cond, detail=""):
    global fails
    if not cond:
        fails += 1
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def main():
    load_env()
    from app import create_app
    from app.models import Profile, db
    from app.services.users import create_user, delete_user

    app = create_app()
    uid = None
    with app.app_context():
        p = create_user(EMAIL, PW, display_name="Smoke Lists", role="user")
        uid = str(p.id)
    check("create ephemeral user", bool(uid))

    try:
        tr = requests.post(
            os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password",
            headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Content-Type": "application/json"},
            json={"email": EMAIL, "password": PW},
            timeout=30,
        )
        check("supabase login", tr.status_code == 200, str(tr.status_code))
        tokens = tr.json()
        s = requests.Session()
        sr = s.post(
            BASE + "/auth/session",
            json={"access_token": tokens["access_token"], "refresh_token": tokens.get("refresh_token", "")},
            timeout=30,
        )
        check("flask session", sr.status_code in (200, 204), str(sr.status_code))

        home = s.get(BASE + "/", timeout=30)
        check("dashboard", home.status_code == 200)
        for needle in ["clashBtn", "view-lists", "lists.js?v=poc32", "logCollapseBtn", "colMetaModal"]:
            check(f"dash {needle}", needle in home.text)

        # nickname on group
        gr = s.post(
            BASE + "/api/groups",
            json={
                "name": "Smoke Group",
                "nickname": "SG",
                "schedule": [{"day": "Monday", "from": "9:00am", "to": "10:00am"}],
                "message": "",
            },
            timeout=30,
        )
        check("POST group+nick", gr.status_code in (200, 201), f"{gr.status_code} {gr.text[:160]}")
        groups = s.get(BASE + "/api/groups", timeout=30).json()
        g = (groups.get("groups") or groups if isinstance(groups, dict) else groups)[0] if groups else None
        if isinstance(groups, dict):
            glist = groups.get("groups") or []
        else:
            glist = groups or []
        g = next((x for x in glist if x.get("name") == "Smoke Group"), glist[0] if glist else None)
        check("group has nickname", bool(g and g.get("nickname") == "SG"), str(g)[:160] if g else "none")

        # contact labels
        cr = s.post(
            BASE + "/api/contacts",
            json={"name": "Parent A", "phone": "923001112233", "message": "hi", "labels": ["Physics"]},
            timeout=30,
        )
        check("POST contact+labels", cr.status_code in (200, 201), f"{cr.status_code} {cr.text[:160]}")

        lr = s.get(BASE + "/api/lists", timeout=30)
        check("GET lists", lr.status_code == 200, f"{lr.status_code} {lr.text[:160]}")
        check("waLabels has Physics", "Physics" in (lr.json().get("waLabels") or []))

        pr = s.post(
            BASE + "/api/lists",
            json={"name": "Physics List", "color": "#0d9488", "labels": ["Physics"], "message": "sched"},
            timeout=30,
        )
        check("POST list", pr.status_code in (200, 201), f"{pr.status_code} {pr.text[:200]}")
        lst = (pr.json().get("list") or {})
        lid = lst.get("id")
        check("auto members", "923001112233" in (lst.get("members") or []), str(lst.get("members")))
        if lid:
            syn = s.post(BASE + f"/api/lists/{lid}/sync", timeout=30)
            check("sync", syn.status_code == 200, syn.text[:120])
            ur = s.put(BASE + f"/api/lists/{lid}", json={"name": "Physics List 2"}, timeout=30)
            check("put", ur.status_code == 200)
            dr = s.delete(BASE + f"/api/lists/{lid}", timeout=30)
            check("delete list", dr.status_code in (200, 204))

    finally:
        with app.app_context():
            actor = Profile.query.filter_by(role="superadmin").first()
            target = db.session.get(Profile, uuid.UUID(uid)) if uid else None
            if target and actor:
                try:
                    delete_user(target, actor)
                    check("cleanup user", True)
                except Exception as e:
                    check("cleanup user", False, str(e))

    print(f"\nDone — {fails} failure(s)")
    return fails


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
