#!/usr/bin/env python3
from pathlib import Path

p = Path("/app/templates/user/index.html")
t = p.read_text(encoding="utf-8", errors="ignore")
print("index exists", p.exists(), "len", len(t))
print("has URLSearchParams view", 'params.get("view")' in t)
print("has waFlow", "waFlow" in t or "wa-flow" in t)
print("cache bumps", [x for x in ["poc24", "poc25", "poc26", "poc27"] if x in t])
prof = Path("/app/templates/user/profile.html").read_text(encoding="utf-8", errors="ignore")
print("has profile-content", "profile-content-wrap" in prof)
print("rail nav exists", Path("/app/templates/user/_rail_nav.html").exists())
print("app.css exists", Path("/app/static/css/app.css").exists())

import app.routes.poc_routes as pr
print("password_request route", hasattr(pr, "profile_password_request"))

from app import create_app
from app.models import db
from sqlalchemy import inspect

app = create_app()
with app.app_context():
    tables = set(inspect(db.engine).get_table_names())
    for name in ["notifications", "password_requests", "webauthn_credentials", "roles"]:
        print("table", name, name in tables)
