#!/usr/bin/env python3
from pathlib import Path
from app import create_app

app = create_app()
print("routes", any(r.rule == "/notifications" for r in app.url_map.iter_rules()))
t = Path("/app/templates/user/index.html").read_text(encoding="utf-8", errors="ignore")
print("cache_poc31", "poc31" in t)
print("view_all", "View all notifications" in Path("/app/static/js/theme.js").read_text(encoding="utf-8", errors="ignore"))
css = Path("/app/static/css/app.css").read_text(encoding="utf-8", errors="ignore")
print("da_ico_dark", 'html[data-theme="dark"] .da-ico' in css)
print("notif_page", Path("/app/templates/user/notifications.html").exists())
