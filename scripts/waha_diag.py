"""One-off WAHA diagnostics (run inside app container)."""
import json

from app import create_app

app = create_app()

with app.app_context():
    from app.services.group_validate import validate_group_names
    from app.services.waha_client import _fetch_chat_items, health, list_groups, session_status

    print("health:", json.dumps(health()))
    print("session:", json.dumps(session_status(), default=str))
    items = _fetch_chat_items(None)
    print("raw_items:", len(items))
    gs = list_groups()
    print("groups_count:", len(gs))
    for g in gs[:15]:
        print(" -", g.get("name"))
    test = "O'LEVEL CS & ENGLISH COACHING"
    print("validate:", json.dumps(validate_group_names([test]), default=str))
