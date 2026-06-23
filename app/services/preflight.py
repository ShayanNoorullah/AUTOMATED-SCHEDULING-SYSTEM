"""Pre-flight checks before bulk automated WhatsApp release."""
from app.services.group_validate import validate_group_names
from app.services.users import maintenance_mode
from app.services.whatsapp_provider import get_provider, require_connected


def build_preflight(profile, targets):
    """Return checklist items and whether send can proceed."""
    checks = []
    targets = [t for t in (targets or []) if t.get("name")]
    group_targets = [t for t in targets if not t.get("phone")]
    contact_targets = [t for t in targets if t.get("phone")]

    maint = maintenance_mode()
    if maint and not profile.is_admin():
        checks.append({
            "id": "maintenance",
            "label": "System not in maintenance mode",
            "ok": False,
            "hint": "Maintenance mode is on — contact an administrator",
        })
    else:
        checks.append({"id": "maintenance", "label": "Maintenance mode off", "ok": True})

    ok_conn, conn_err = require_connected()
    checks.append({
        "id": "session",
        "label": "WhatsApp session connected",
        "ok": ok_conn,
        "hint": conn_err or "",
    })

    empty = [t["name"] for t in targets if not (t.get("message") or "").strip()]
    checks.append({
        "id": "messages",
        "label": "All targets have message content",
        "ok": not empty,
        "hint": f"Empty: {', '.join(empty[:5])}" if empty else "",
    })

    if group_targets and get_provider() == "waha":
        names = [t["name"] for t in group_targets]
        validation = validate_group_names(names)
        missing = [n for n, v in validation.items() if not v.get("ok")]
        checks.append({
            "id": "groups",
            "label": "All group names found in WhatsApp",
            "ok": not missing,
            "hint": f"Not found: {', '.join(missing[:5])}" if missing else "",
            "details": validation,
        })

    if contact_targets:
        bad = [t["name"] for t in contact_targets if not (t.get("phone") or "").strip()]
        checks.append({
            "id": "phones",
            "label": "Contacts have phone numbers",
            "ok": not bad,
            "hint": f"Missing phone: {', '.join(bad[:5])}" if bad else "",
        })

    ready = all(c["ok"] for c in checks)
    return {"ready": ready, "checks": checks}
