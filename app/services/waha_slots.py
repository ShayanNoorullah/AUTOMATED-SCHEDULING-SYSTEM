"""Per-user WAHA Core isolation via free multi-container slots.

WAHA Core (free) allows only one session named "default" per container.
To give every SSIES user their own WhatsApp without a paid WAHA Plus
license, we run several identical free WAHA containers (waha, waha2, …)
and assign each profile a dedicated slot / base URL.
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse

from app.models import Profile, db
from app.services.users import get_system_setting


def in_docker() -> bool:
    return os.environ.get("DOCKER") == "1"


def primary_waha_base_url() -> str:
    """Configured WAHA URL, rewritten for local Windows/macOS when not in Docker.

    Production may store http://waha:3000 in shared Supabase settings. That hostname
    only resolves inside Compose — locally we map waha → localhost (and wahaN → :3000+N-1).
    """
    raw = (get_system_setting("waha_base_url", "") or "").strip().rstrip("/")
    if not raw:
        raw = "http://waha:3000" if in_docker() else "http://localhost:3000"
    return localize_waha_url(raw)


def localize_waha_url(url: str) -> str:
    """Map Docker service hostnames to localhost when the app runs outside Compose."""
    url = (url or "").strip().rstrip("/")
    if not url:
        return "http://localhost:3000" if not in_docker() else "http://waha:3000"
    if in_docker():
        return url

    parsed = urlparse(url if "://" in url else f"http://{url}")
    host = (parsed.hostname or "").lower()
    if not host:
        return url

    # Docker DNS names used by compose (waha, waha2, …) are unreachable on the host OS.
    m = re.fullmatch(r"waha(\d*)", host)
    if not m:
        return url

    slot_suffix = m.group(1)
    slot = int(slot_suffix) if slot_suffix else 1
    port = 3000 + (slot - 1)
    return f"{parsed.scheme or 'http'}://127.0.0.1:{port}"


def max_waha_slots() -> int:
    env = (os.environ.get("WAHA_SLOTS") or "").strip()
    if env.isdigit():
        return max(1, min(20, int(env)))
    try:
        n = int(get_system_setting("waha_slots", 5) or 5)
    except (TypeError, ValueError):
        n = 5
    return max(1, min(20, n))


def slot_base_url(slot: int) -> str:
    """Map slot number → WAHA container URL.

    Slot 1 uses the configured primary base URL (existing `waha` service).
    Slots 2+ use `waha{n}` on the same scheme/port, or localhost port+offset.
    """
    base = primary_waha_base_url()
    if slot <= 1:
        return base

    parsed = urlparse(base if "://" in base else f"http://{base}")
    scheme = parsed.scheme or "http"
    host = parsed.hostname or "waha"

    if host in ("localhost", "127.0.0.1"):
        port = (parsed.port or 3000) + (slot - 1)
        return f"{scheme}://{host}:{port}"

    root = re.sub(r"\d+$", "", host) or "waha"
    port_part = f":{parsed.port}" if parsed.port else ""
    return localize_waha_url(f"{scheme}://{root}{slot}{port_part}")


def get_user_slot(user_id) -> int | None:
    if not user_id:
        return None
    profile = db.session.get(Profile, user_id)
    if not profile:
        return None
    return profile.waha_slot


def ensure_user_slot(user_id) -> int:
    """Assign the lowest free slot when the user links WhatsApp."""
    profile = db.session.get(Profile, user_id)
    if not profile:
        raise ValueError("User not found")
    if profile.waha_slot:
        return int(profile.waha_slot)

    max_slots = max_waha_slots()
    used = {
        int(s)
        for (s,) in db.session.query(Profile.waha_slot)
        .filter(Profile.waha_slot.isnot(None))
        .all()
    }
    for slot in range(1, max_slots + 1):
        if slot not in used:
            profile.waha_slot = slot
            db.session.commit()
            return slot
    raise RuntimeError(
        f"All {max_slots} WhatsApp slots are in use. "
        "Ask a superadmin to raise WAHA_SLOTS and add matching wahaN containers "
        "(same free image — no license cost)."
    )


def release_user_slot(user_id) -> None:
    profile = db.session.get(Profile, user_id)
    if profile and profile.waha_slot is not None:
        profile.waha_slot = None
        db.session.commit()


def bootstrap_primary_slot() -> None:
    """Keep the existing primary WAHA volume with the first superadmin."""
    try:
        if Profile.query.filter_by(waha_slot=1).first():
            return
        sa = (
            Profile.query.filter_by(role="superadmin", is_active=True)
            .order_by(Profile.created_at.asc())
            .first()
        )
        if sa:
            sa.waha_slot = 1
            db.session.commit()
    except Exception:
        db.session.rollback()
