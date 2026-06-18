"""WhatsApp deep-link helpers for direct (non-Selenium) sending."""
import re
from urllib.parse import quote

from app.crypto import dec
from app.models import Group, Contact, ReleaseLog, db
from app.services.audit import audit
from app.services.whatsapp import format_message, digits

INVITE_RE = re.compile(r"^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$", re.I)
WA_WEB = "https://web.whatsapp.com"


def validate_invite_link(url):
    url = (url or "").strip()
    if not url:
        return ""
    if INVITE_RE.match(url):
        return url
    raise ValueError("Invite link must be https://chat.whatsapp.com/...")


def build_contact_url(phone, message):
    p = digits(phone)
    if not p:
        return ""
    text = quote((message or "").strip())
    return f"https://wa.me/{p}" + (f"?text={text}" if text else "")


def build_group_payload(group_row, message):
    invite = (getattr(group_row, "invite_link", None) or "").strip()
    return {
        "name": group_row.name,
        "inviteLink": invite,
        "webUrl": WA_WEB,
        "directUrl": invite if invite else WA_WEB,
        "message": message,
        "needsCopy": True,
    }


def build_links_for_user(user_id, groups=None, contacts=None):
    group_rows = Group.query.filter_by(user_id=user_id).order_by(Group.position, Group.id).all()
    contact_rows = Contact.query.filter_by(user_id=user_id).order_by(Contact.position, Contact.id).all()

    if groups is not None:
        names = {g.get("name") for g in groups}
        group_rows = [g for g in group_rows if g.name in names]
    if contacts is not None:
        names = {c.get("name") for c in contacts}
        contact_rows = [c for c in contact_rows if c.name in names]

    out_groups = []
    for g in group_rows:
        msg = dec(g.message_enc) or format_message(g.schedule)
        out_groups.append(build_group_payload(g, msg))

    out_contacts = []
    for c in contact_rows:
        msg = dec(c.message_enc)
        phone = dec(c.phone_enc)
        out_contacts.append({
            "name": c.name,
            "phone": phone,
            "url": build_contact_url(phone, msg),
            "message": msg,
        })

    return {"groups": out_groups, "contacts": out_contacts}


def log_direct_open(user_id, target_name, target_type="group", actor_id=None):
    audit("direct_whatsapp", f"{target_type}={target_name}", actor_id=actor_id or user_id, target_id=user_id)
    db.session.add(ReleaseLog(
        user_id=user_id,
        target_name=target_name,
        target_type=target_type,
        status="direct",
        detail="Opened via WhatsApp deep link",
    ))
    db.session.commit()
