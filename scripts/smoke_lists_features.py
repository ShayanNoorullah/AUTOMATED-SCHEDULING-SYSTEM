"""Smoke-check scheduler extras + Lists port (static markers + optional live API)."""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:5000").rstrip("/")
fails = 0


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


def check(name: str, cond: bool, detail: str = ""):
    global fails
    mark = "PASS" if cond else "FAIL"
    if not cond:
        fails += 1
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))


def main():
    load_run_local()
    print("=== Static markers ===")
    idx = (ROOT / "templates/user/index.html").read_text(encoding="utf-8")
    css = (ROOT / "static/css/app.css").read_text(encoding="utf-8")
    lists_js = ROOT / "static/js/lists.js"
    rail = (ROOT / "templates/user/_rail_nav.html").read_text(encoding="utf-8")
    mig = ROOT / "supabase/migrations/004_sched_lists.sql"

    for needle in [
        "view-lists", "clashBtn", "colCollapsed", "lists.js", "logCollapseBtn",
        "colMetaModal", "toggleClash", "refreshClashes", "colDisplay", "poc32",
        "expandAllCols", "clashBanner",
    ]:
        check(f"index has {needle}", needle in idx)
    check("rail has lists", 'data-view="lists"' in rail)
    check("lists.js exists", lists_js.exists())
    check("css clash-bar", ".clash-bar" in css)
    check("css log-btn", ".log-btn" in css)
    check("css col-collapsed", ".col-collapsed" in css)
    check("css navbar full-width", "max-width:none" in css)
    check("migration 004", mig.exists())
    check("single showLog", idx.count("function showLog(") == 1)
    check("no leftover poc31 in index scripts", "?v=poc31" not in idx)

    # models/routes
    models = (ROOT / "app/models.py").read_text(encoding="utf-8")
    routes = (ROOT / "app/routes/user_routes.py").read_text(encoding="utf-8")
    check("ContactList model", "class ContactList" in models)
    check("lists GET route", '@bp.route("/api/lists", methods=["GET"])' in routes)
    check("lists sync route", "/api/lists/<public_id>/sync" in routes)

    print("\n=== Live HTTP (unauthenticated markers) ===")
    try:
        h = requests.get(BASE + "/health", timeout=15)
        check("health", h.status_code == 200, h.text[:120])
    except Exception as e:
        check("health", False, str(e))
        print("Skip authenticated API — server unreachable")
        return fails

    # Static assets served
    for path in ["/static/js/lists.js", "/static/css/app.css"]:
        r = requests.get(BASE + path, timeout=20)
        check(f"GET {path}", r.status_code == 200, f"{r.status_code} len={len(r.content)}")
        if path.endswith("lists.js") and r.status_code == 200:
            check("lists.js has sendList", "function sendList" in r.text)

    # Authenticated API if creds present
    email = os.environ.get("SMOKE_EMAIL") or os.environ.get("SUPERADMIN_EMAIL")
    password = os.environ.get("SMOKE_PASSWORD") or os.environ.get("SUPERADMIN_PASSWORD")
    if not email or not password:
        print("\n(no SMOKE_EMAIL/PASSWORD — skip authenticated lists CRUD)")
        return fails

    print("\n=== Authenticated lists CRUD ===")
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password"
    tr = requests.post(
        url,
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    check("supabase login", tr.status_code == 200, str(tr.status_code))
    if tr.status_code != 200:
        return fails
    tokens = tr.json()
    s = requests.Session()
    sr = s.post(
        BASE + "/auth/session",
        json={"access_token": tokens["access_token"], "refresh_token": tokens.get("refresh_token", "")},
        timeout=30,
    )
    check("flask session", sr.status_code in (200, 204), str(sr.status_code))

    lr = s.get(BASE + "/api/lists", timeout=30)
    check("GET /api/lists", lr.status_code == 200, f"{lr.status_code} {lr.text[:160]}")
    if lr.status_code != 200:
        return fails
    body = lr.json()
    check("lists payload shape", "lists" in body and "waLabels" in body)

    name = f"Smoke List {uuid.uuid4().hex[:6]}"
    cr = s.post(
        BASE + "/api/lists",
        json={"name": name, "color": "#0d9488", "labels": ["smoke-label"], "members": [], "message": "hi"},
        timeout=30,
    )
    check("POST /api/lists", cr.status_code in (200, 201), f"{cr.status_code} {cr.text[:200]}")
    if cr.status_code not in (200, 201):
        return fails
    created = cr.json().get("list") or cr.json()
    lid = created.get("id") or created.get("public_id")
    check("list id returned", bool(lid), str(created)[:200])

    if lid:
        ur = s.put(
            BASE + f"/api/lists/{lid}",
            json={"name": name + " upd", "labels": ["smoke-label"], "members": []},
            timeout=30,
        )
        check("PUT /api/lists", ur.status_code == 200, f"{ur.status_code} {ur.text[:160]}")
        syn = s.post(BASE + f"/api/lists/{lid}/sync", timeout=30)
        check("POST sync", syn.status_code == 200, f"{syn.status_code} {syn.text[:160]}")
        dr = s.delete(BASE + f"/api/lists/{lid}", timeout=30)
        check("DELETE /api/lists", dr.status_code in (200, 204), str(dr.status_code))

    # dashboard HTML should include new markers when logged in
    home = s.get(BASE + "/", timeout=30)
    check("dashboard HTML", home.status_code == 200)
    if home.status_code == 200:
        for needle in ["clashBtn", "view-lists", "lists.js", "logCollapseBtn"]:
            check(f"dashboard has {needle}", needle in home.text)

    return fails


if __name__ == "__main__":
    code = main()
    print(f"\nDone — {code} failure(s)")
    sys.exit(1 if code else 0)
