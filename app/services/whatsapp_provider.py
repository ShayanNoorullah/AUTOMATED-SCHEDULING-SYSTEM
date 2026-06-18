"""WhatsApp send provider abstraction (WAHA vs Selenium)."""
import os

from app.services.users import get_system_setting


def get_provider():
    return get_system_setting("wa_provider", "selenium") or "selenium"


def selenium_session_cached():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    session_dir = os.path.join(base, "whatsapp_session")
    return os.path.isdir(session_dir) and bool(os.listdir(session_dir))


def session_info():
    provider = get_provider()
    info = {"provider": provider, "connected": False, "detail": ""}
    if provider == "waha":
        from app.services.waha_client import session_status
        st = session_status()
        info["connected"] = st.get("connected", False)
        info["sessionName"] = st.get("name")
        info["status"] = st.get("status")
        if st.get("error"):
            info["detail"] = st["error"]
            info["error"] = st["error"]
        elif info["connected"]:
            info["detail"] = "WAHA connected"
        elif st.get("status") == "SCAN_QR_CODE":
            info["detail"] = "Scan QR code below"
        elif st.get("status") == "STARTING":
            info["detail"] = "Starting WAHA session…"
        elif st.get("status") == "FAILED":
            info["detail"] = "Session failed — use Reset & new QR"
        else:
            info["detail"] = f"WAHA session ({st.get('status', 'unknown')})"
    elif provider == "selenium":
        info["connected"] = selenium_session_cached()
        info["detail"] = "Chrome profile cached" if info["connected"] else "Scan QR via automated send"
    else:
        info["detail"] = "Direct links only — no automation session"
    return info


def require_connected():
    provider = get_provider()
    if provider == "direct_only":
        return False, "Automated send is disabled (direct links only mode)"
    if provider == "selenium":
        # First automated send opens Chrome for QR scan; no cached profile required.
        return True, None
    info = session_info()
    if provider == "waha" and not info.get("connected"):
        return False, "WAHA not connected — open Automated Send and scan QR first"
    return True, None


def send_target(name, message, headless=False, phone=None, log=None, provider=None):
    provider = provider or get_provider()
    if provider == "direct_only":
        return False
    if provider == "waha":
        from app.services.waha_client import send_to_target as waha_send
        ok, err = waha_send(name, message, phone=phone)
        if log:
            if ok:
                log(f"success:Sent via WAHA → {name}")
            else:
                log(f"error:{err or 'WAHA send failed'}")
        return ok
    from whatsapp_sender import send_to_target as selenium_send
    return selenium_send(name, message, headless=headless, phone=phone, log=log)
