import uuid

from flask import Blueprint, g, jsonify, render_template, request, Response
import queue

from app.auth.decorators import login_required, superadmin_required
from app.config import Config, DAYS
from app.crypto import enc, dec
from app.models import Group, Template, Contact, ContactList, Profile, AuditLog, ReleaseLog, ScheduledJob, db
from app.services.audit import audit
from app.services.users import maintenance_mode
from app.services.whatsapp import (
    group_dict, template_dict, contact_dict, digits, format_message,
    run_release, status_queue, any_release_busy,
)

bp = Blueprint("user", __name__)


def _parse_uid(s):
    try:
        return uuid.UUID(str(s))
    except (ValueError, TypeError):
        return None


def _effective_user_id():
    if g.profile.is_superadmin() and request.args.get("asUser"):
        try:
            return uuid.UUID(request.args.get("asUser"))
        except (ValueError, TypeError):
            pass
    return g.profile.id


def _seed_default_template(user_id):
    from app.services.template_seed import seed_default_template_for_user
    seed_default_template_for_user(user_id)


def _entity_photo_url(entity, row):
    """Return photo API URL only when the file exists on disk."""
    rel = getattr(row, "photo_path", None)
    if not rel:
        return None
    import os
    from app.config import INSTANCE_DIR
    full = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads", rel))
    root = os.path.normpath(os.path.join(INSTANCE_DIR, "uploads"))
    if not (full.startswith(root + os.sep) and os.path.isfile(full)):
        return None
    return f"/api/photos/file/{entity}/{row.id}"


def _enrich_group(row):
    d = group_dict(row)
    d["id"] = row.id
    d["waLinked"] = bool(getattr(row, "wa_linked", False))
    d["photoUrl"] = _entity_photo_url("groups", row)
    return d


def _enrich_contact(row):
    d = contact_dict(row)
    d["id"] = row.id
    d["waLinked"] = bool(getattr(row, "wa_linked", False))
    d["photoUrl"] = _entity_photo_url("contacts", row)
    return d


@bp.route("/")
@login_required
def index():
    photo_url = g.profile.photo_url() if hasattr(g.profile, "photo_url") else None
    return render_template(
        "user/index.html",
        days=DAYS,
        username=g.profile.display_label(),
        email=g.profile.email,
        role=g.profile.role,
        photo_url=photo_url,
        csrf_token="",
    )


@bp.route("/profile")
@login_required
def profile_page():
    return render_template(
        "user/profile.html",
        profile=g.profile,
        back_url="/",
        back_label="Dashboard",
        use_portal=False,
    )


@bp.route("/notifications")
@login_required
def notifications_page():
    role = g.profile.role
    if role == "admin":
        return render_template(
            "user/notifications.html",
            profile=g.profile,
            use_portal=True,
            portal_kind="admin",
            portal_title="Admin Portal",
            back_url="/admin/",
        )
    if role == "superadmin":
        return render_template(
            "user/notifications.html",
            profile=g.profile,
            use_portal=True,
            portal_kind="superadmin",
            portal_title="Superadmin",
            back_url="/superadmin/",
        )
    return render_template(
        "user/notifications.html",
        profile=g.profile,
        use_portal=False,
        back_url="/",
    )


@bp.route("/api/profile", methods=["GET"])
@login_required
def get_profile():
    p = g.profile
    return jsonify({
        "email": p.email,
        "displayName": p.display_name or "",
        "role": p.role,
        "createdAt": p.created_at.isoformat(timespec="seconds") if p.created_at else None,
        "lastLoginAt": p.last_login_at.isoformat(timespec="seconds") if p.last_login_at else None,
    })


@bp.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():
    from app.services.users import update_user_profile
    data = request.json or {}
    try:
        update_user_profile(g.profile, data, g.profile)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    return jsonify({"ok": True})


@bp.route("/api/auth/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.json or {}
    current = data.get("current") or ""
    new_pw = data.get("new") or ""
    if len(new_pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    try:
        from app.auth.decorators import get_supabase_admin
        sb = get_supabase_admin()
        sb.auth.sign_in_with_password({"email": g.profile.email, "password": current})
        sb.auth.admin.update_user_by_id(str(g.profile.id), {"password": new_pw})
        audit("password_change", actor_id=g.profile.id)
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"error": "Current password is incorrect"}), 401


@bp.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    return jsonify([_enrich_group(g) for g in rows])


def _parse_invite_link(data):
    from app.services.whatsapp_links import validate_invite_link
    raw = (data.get("inviteLink") or data.get("invite_link") or "").strip()
    if not raw:
        return ""
    return validate_invite_link(raw)


@bp.route("/api/groups", methods=["POST"])
@login_required
def add_group():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name") or not data.get("schedule"):
        return jsonify({"error": "name and schedule required"}), 400
    if Group.query.filter_by(user_id=uid, name=data["name"]).first():
        return jsonify({"error": "Group name already exists"}), 409
    try:
        invite = _parse_invite_link(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    n = Group.query.filter_by(user_id=uid).count()
    db.session.add(Group(user_id=uid, name=data["name"], nickname=(data.get("nickname") or "").strip()[:120],
                         schedule=data["schedule"],
                         message_enc=enc(data.get("message", "")),
                         last_released=data.get("lastReleased", ""), invite_link=invite,
                         wa_linked=bool(invite), position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups/<int:idx>", methods=["PUT"])
@login_required
def update_group(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    g_row = rows[idx]
    g_row.name = data["name"]
    if "nickname" in data:
        g_row.nickname = (data.get("nickname") or "").strip()[:120]
    g_row.schedule = data["schedule"]
    g_row.message_enc = enc(data.get("message", ""))
    g_row.last_released = data.get("lastReleased", g_row.last_released)
    if "inviteLink" in data or "invite_link" in data:
        try:
            g_row.invite_link = _parse_invite_link(data)
            if g_row.invite_link:
                g_row.wa_linked = True  # additive: never clear on empty
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups", methods=["PUT"])
@login_required
def replace_all_groups():
    data = request.json or {}
    uid = _effective_user_id()
    groups = data.get("groups")
    if groups is None:
        return jsonify({"error": "groups list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    for i, g_item in enumerate(groups):
        inv = ""
        try:
            inv = _parse_invite_link(g_item)
        except ValueError:
            inv = ""
        db.session.add(Group(user_id=uid, name=g_item.get("name", ""),
                             nickname=(g_item.get("nickname") or "").strip()[:120],
                             schedule=g_item.get("schedule", []),
                             message_enc=enc(g_item.get("message", "")), last_released=g_item.get("lastReleased", ""),
                             invite_link=inv, position=i))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/groups/<int:idx>", methods=["DELETE"])
@login_required
def delete_group(idx):
    uid = _effective_user_id()
    rows = Group.query.filter_by(user_id=uid).order_by(Group.position, Group.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx])
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates", methods=["GET"])
@login_required
def get_templates():
    from app.services.template_seed import ensure_default_template, DEFAULT_TEMPLATE_NAME
    uid = _effective_user_id()
    ensure_default_template(uid)
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    out = []
    for t in rows:
        d = template_dict(t)
        d["isDefault"] = t.name == DEFAULT_TEMPLATE_NAME
        out.append(d)
    return jsonify(out)


@bp.route("/api/templates", methods=["POST"])
@login_required
def add_template():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name"):
        return jsonify({"error": "Template name required"}), 400
    n = Template.query.filter_by(user_id=uid).count()
    db.session.add(Template(user_id=uid, name=data["name"], content_enc=enc(data.get("content", "")), position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates/<int:idx>", methods=["PUT"])
@login_required
def update_template(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    rows[idx].name = data["name"]
    rows[idx].content_enc = enc(data.get("content", ""))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/templates/<int:idx>", methods=["DELETE"])
@login_required
def delete_template(idx):
    from app.services.template_seed import DEFAULT_TEMPLATE_NAME, seed_default_template_for_user
    uid = _effective_user_id()
    rows = Template.query.filter_by(user_id=uid).order_by(Template.position, Template.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    row = rows[idx]
    was_default = row.name == DEFAULT_TEMPLATE_NAME
    db.session.delete(row)
    if was_default:
        seed_default_template_for_user(uid)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts", methods=["GET"])
@login_required
def get_contacts():
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    return jsonify([_enrich_contact(c) for c in rows])


@bp.route("/api/contacts", methods=["POST"])
@login_required
def add_contact():
    data = request.json or {}
    uid = _effective_user_id()
    if not data.get("name") or not digits(data.get("phone")):
        return jsonify({"error": "Contact name and phone required"}), 400
    n = Contact.query.filter_by(user_id=uid).count()
    labels = data.get("labels") if isinstance(data.get("labels"), list) else []
    labels = [str(x).strip() for x in labels if str(x).strip()]
    db.session.add(Contact(user_id=uid, name=data["name"], phone_enc=enc(digits(data.get("phone"))),
                          message_enc=enc(data.get("message", "")), labels=labels, position=n))
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts/<int:idx>", methods=["PUT"])
@login_required
def update_contact(idx):
    data = request.json or {}
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    c = rows[idx]
    c.name = data["name"]
    c.phone_enc = enc(digits(data.get("phone")))
    c.message_enc = enc(data.get("message", ""))
    c.last_released = data.get("lastReleased", c.last_released)
    if "labels" in data:
        labels = data.get("labels") if isinstance(data.get("labels"), list) else []
        c.labels = [str(x).strip() for x in labels if str(x).strip()]
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/contacts/<int:idx>", methods=["DELETE"])
@login_required
def delete_contact(idx):
    uid = _effective_user_id()
    rows = Contact.query.filter_by(user_id=uid).order_by(Contact.position, Contact.id).all()
    if idx >= len(rows):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(rows[idx])
    db.session.commit()
    return jsonify({"ok": True})


def _contact_name_map(uid):
    """Request-scoped {phone_digits: display_name} for a user's saved contacts."""
    cache = getattr(g, "_contact_name_cache", None)
    if cache is None:
        cache = {}
        g._contact_name_cache = cache
    if uid in cache:
        return cache[uid]
    m = {}
    for c in Contact.query.filter_by(user_id=uid).all():
        ph = digits(dec(c.phone_enc))
        nm = (c.name or "").strip()
        if ph and nm and nm != ph:
            m[ph] = nm
    cache[uid] = m
    return m


def _list_dict(row):
    groups = row.groups if isinstance(getattr(row, "groups", None), list) else []
    members = row.members if isinstance(row.members, list) else []
    name_map = _contact_name_map(row.user_id)
    member_names = {}
    for ph in members:
        d = digits(ph)
        if d and name_map.get(d):
            member_names[d] = name_map[d]
    return {
        "id": row.public_id,
        "dbId": row.id,
        "name": row.name,
        "color": row.color or "#0d9488",
        "labels": row.labels if isinstance(row.labels, list) else [],
        "members": members,
        "memberNames": member_names,
        "groups": groups,
        "message": dec(row.message_enc) if row.message_enc else "",
    }


@bp.route("/api/lists", methods=["GET"])
@login_required
def get_lists():
    uid = _effective_user_id()
    rows = ContactList.query.filter_by(user_id=uid).order_by(ContactList.position, ContactList.id).all()
    # Aggregate known WhatsApp labels from contacts for the list editor
    labels = set()
    for c in Contact.query.filter_by(user_id=uid).all():
        for lab in (c.labels or []):
            if str(lab).strip():
                labels.add(str(lab).strip())
    for row in rows:
        for lab in (row.labels or []):
            if str(lab).strip():
                labels.add(str(lab).strip())
    return jsonify({"lists": [_list_dict(r) for r in rows], "waLabels": sorted(labels)})


@bp.route("/api/lists", methods=["POST"])
@login_required
def create_list():
    data = request.json or {}
    uid = _effective_user_id()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "List name required"}), 400
    public_id = (data.get("id") or "").strip() or ("l-" + uuid.uuid4().hex[:8])
    labels = data.get("labels") if isinstance(data.get("labels"), list) else []
    labels = [str(x).strip() for x in labels if str(x).strip()]
    members = data.get("members") if isinstance(data.get("members"), list) else []
    members = [digits(x) for x in members if digits(x)]
    # Auto-discover members from contact labels if not provided
    if not members and labels:
        for c in Contact.query.filter_by(user_id=uid).all():
            cl = c.labels or []
            if any(lab in cl for lab in labels):
                ph = digits(dec(c.phone_enc))
                if ph and ph not in members:
                    members.append(ph)
    groups_in = data.get("groups") if isinstance(data.get("groups"), list) else []
    groups = []
    for g in groups_in:
        if isinstance(g, dict) and (g.get("id") or g.get("name")):
            groups.append({"id": str(g.get("id") or ""), "name": str(g.get("name") or g.get("id") or "")[:255]})
        elif isinstance(g, str) and g.strip():
            groups.append({"id": g.strip(), "name": g.strip()[:255]})
    n = ContactList.query.filter_by(user_id=uid).count()
    row = ContactList(
        user_id=uid, public_id=public_id, name=name,
        color=(data.get("color") or "#0d9488")[:20],
        labels=labels, members=members, groups=groups,
        message_enc=enc(data.get("message") or ""),
        position=n,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "list": _list_dict(row)})


@bp.route("/api/lists/<public_id>", methods=["PUT"])
@login_required
def update_list(public_id):
    data = request.json or {}
    uid = _effective_user_id()
    row = ContactList.query.filter_by(user_id=uid, public_id=public_id).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "List name required"}), 400
        row.name = name
    if "color" in data:
        row.color = (data.get("color") or "#0d9488")[:20]
    if "labels" in data:
        labels = data.get("labels") if isinstance(data.get("labels"), list) else []
        row.labels = [str(x).strip() for x in labels if str(x).strip()]
    if "members" in data:
        members = data.get("members") if isinstance(data.get("members"), list) else []
        row.members = [digits(x) for x in members if digits(x)]
    if "groups" in data:
        groups_in = data.get("groups") if isinstance(data.get("groups"), list) else []
        groups = []
        for g in groups_in:
            if isinstance(g, dict) and (g.get("id") or g.get("name")):
                groups.append({"id": str(g.get("id") or ""), "name": str(g.get("name") or g.get("id") or "")[:255]})
            elif isinstance(g, str) and g.strip():
                groups.append({"id": g.strip(), "name": g.strip()[:255]})
        row.groups = groups
    if "message" in data:
        row.message_enc = enc(data.get("message") or "")
    db.session.commit()
    return jsonify({"ok": True, "list": _list_dict(row)})


@bp.route("/api/lists/<public_id>", methods=["DELETE"])
@login_required
def delete_list(public_id):
    uid = _effective_user_id()
    row = ContactList.query.filter_by(user_id=uid, public_id=public_id).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/lists/<public_id>/sync", methods=["POST"])
@login_required
def sync_list(public_id):
    """Pull matching WhatsApp label chats into this list (falls back to local labels)."""
    uid = _effective_user_id()
    row = ContactList.query.filter_by(user_id=uid, public_id=public_id).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    try:
        result = _sync_lists_from_whatsapp(uid, only_public_id=public_id)
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    lists = result.get("lists") or []
    matched = next((l for l in lists if l.get("id") == public_id), _list_dict(row))
    return jsonify({"ok": True, "list": matched, "added": result.get("contactsUpserted", 0),
                    "waLabels": result.get("waLabels") or [], "source": result.get("source")})


@bp.route("/api/lists/sync-all", methods=["POST"])
@login_required
def sync_all_lists():
    """Discover WhatsApp Business labels + contacts and rebuild SSIES lists."""
    uid = _effective_user_id()
    try:
        result = _sync_lists_from_whatsapp(uid)
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"ok": True, **result})


def _sync_lists_from_whatsapp(uid, only_public_id=None):
    """
    Sync ContactList rows from WhatsApp Business labels via WAHA.
    Creates missing lists for each WA label, upserts contacts from labeled chats,
    attaches labeled groups, and assigns membership. Falls back to local labels if WAHA fails.
    """
    import uuid as _uuid
    from app.services.waha_client import (
        WahaError, use_waha_user, get_labels, get_chats_for_label, phone_from_chat,
        get_lid_phone_map, get_contact_directory, get_group_name_map,
        _chat_id, _is_group_chat, _group_label,
    )

    wa_labels = []
    source = "local"
    label_to_phones = {}  # label name -> [phones]
    label_to_groups = {}  # label name -> [{id, name}]
    phone_meta = {}  # phone -> {name, labels:set}
    lid_map = {}
    name_directory = {}
    group_names = {}

    try:
        with use_waha_user(uid, assign=False):
            try:
                lid_map = get_lid_phone_map() or {}
            except WahaError:
                lid_map = {}
            try:
                name_directory = get_contact_directory(lid_map=lid_map) or {}
            except Exception:
                name_directory = {}
            try:
                group_names = get_group_name_map() or {}
            except Exception:
                group_names = {}
            raw_labels = get_labels() or []
            for lab in raw_labels:
                if not isinstance(lab, dict):
                    continue
                name = (lab.get("name") or "").strip()
                lid = lab.get("id")
                if not name or lid is None:
                    continue
                wa_labels.append(name)
                try:
                    chats = get_chats_for_label(lid) or []
                except WahaError:
                    chats = []
                phones = []
                groups_found = []
                seen_gids = set()
                for chat in chats:
                    if not isinstance(chat, dict):
                        continue
                    gid = _chat_id(chat)
                    if _is_group_chat(chat, gid):
                        if not gid or gid in seen_gids:
                            continue
                        seen_gids.add(gid)
                        gname = (
                            _group_label(chat)
                            or group_names.get(str(gid))
                            or group_names.get(gid)
                            or str(gid)
                        )
                        groups_found.append({"id": str(gid), "name": str(gname)[:255]})
                        continue
                    ph = phone_from_chat(chat, lid_map=lid_map)
                    if not ph:
                        continue
                    phones.append(ph)
                    meta = phone_meta.setdefault(ph, {"name": "", "labels": set()})
                    meta["labels"].add(name)
                    cname = ""
                    for key in ("name", "pushName", "pushname", "notifyName", "formattedName", "subject", "title"):
                        val = chat.get(key)
                        if isinstance(val, str) and val.strip():
                            cname = val.strip()
                            break
                    if not cname:
                        cname = name_directory.get(ph) or ""
                    if cname and (not meta["name"] or meta["name"] == ph):
                        meta["name"] = cname
                label_to_phones[name] = phones
                label_to_groups[name] = groups_found
            source = "whatsapp"
    except WahaError as e:
        source = "local"
        local_err = str(e)
    else:
        local_err = None

    # Enrich phone_meta names from directory for any still-empty entries
    for ph, meta in phone_meta.items():
        if (not meta["name"] or meta["name"] == ph) and name_directory.get(ph):
            meta["name"] = name_directory[ph]

    contacts_by_phone = {}
    for c in Contact.query.filter_by(user_id=uid).all():
        ph = digits(dec(c.phone_enc))
        if ph:
            contacts_by_phone[ph] = c

    upserted = 0
    for ph, meta in phone_meta.items():
        row_c = contacts_by_phone.get(ph)
        labs = sorted(meta["labels"])
        resolved_name = (meta["name"] or name_directory.get(ph) or ph)[:255]
        if row_c is None:
            n = Contact.query.filter_by(user_id=uid).count()
            row_c = Contact(
                user_id=uid,
                name=resolved_name,
                phone_enc=enc(ph),
                message_enc=enc(""),
                labels=labs,
                wa_linked=True,
                position=n,
            )
            db.session.add(row_c)
            contacts_by_phone[ph] = row_c
            upserted += 1
        else:
            existing = row_c.labels if isinstance(row_c.labels, list) else []
            merged_labs = sorted(set([str(x).strip() for x in existing if str(x).strip()] + labs))
            row_c.labels = merged_labs
            if resolved_name and resolved_name != ph and (not row_c.name or row_c.name == ph):
                row_c.name = resolved_name
            row_c.wa_linked = True
            upserted += 1

    db.session.flush()

    def _find_list_for_label(label_name):
        ln = label_name.strip().lower()
        for r in ContactList.query.filter_by(user_id=uid).all():
            labs = r.labels if isinstance(r.labels, list) else []
            if any(str(x).strip().lower() == ln for x in labs):
                return r
            if (r.name or "").strip().lower() == ln:
                return r
        return None

    if source == "whatsapp" and not only_public_id:
        for lab_name in wa_labels:
            if _find_list_for_label(lab_name):
                continue
            n = ContactList.query.filter_by(user_id=uid).count()
            db.session.add(ContactList(
                user_id=uid,
                public_id="l-" + _uuid.uuid4().hex[:8],
                name=lab_name[:255],
                color="#0d9488",
                labels=[lab_name],
                members=list(label_to_phones.get(lab_name) or []),
                groups=list(label_to_groups.get(lab_name) or []),
                message_enc=enc(""),
                position=n,
            ))
        db.session.flush()

    targets = ContactList.query.filter_by(user_id=uid).order_by(ContactList.position, ContactList.id).all()
    if only_public_id:
        targets = [r for r in targets if r.public_id == only_public_id]

    contacts_by_phone = {}
    for c in Contact.query.filter_by(user_id=uid).all():
        ph = digits(dec(c.phone_enc))
        if ph:
            contacts_by_phone[ph] = c
            # Backfill names from WA directory when contact still shows as phone digits
            if name_directory.get(ph) and (not c.name or c.name == ph):
                c.name = name_directory[ph][:255]

    for row in targets:
        labs = [str(x).strip() for x in (row.labels or []) if str(x).strip()]
        found = []
        found_groups = []
        seen_gids = set()
        for lab in labs:
            for ph in label_to_phones.get(lab) or []:
                if ph not in found:
                    found.append(ph)
            for g in label_to_groups.get(lab) or []:
                gid = str(g.get("id") or "")
                if gid and gid not in seen_gids:
                    seen_gids.add(gid)
                    found_groups.append(g)
        for ph, c in contacts_by_phone.items():
            cl = c.labels if isinstance(c.labels, list) else []
            if labs and any(lab in cl for lab in labs) and ph not in found:
                found.append(ph)
        for ph in (row.members or []):
            d = digits(ph)
            if d and d in contacts_by_phone and d not in found:
                found.append(d)
        # Preserve manually kept groups when WA sync didn't return them
        for g in (row.groups or []) if isinstance(row.groups, list) else []:
            if not isinstance(g, dict):
                continue
            gid = str(g.get("id") or "")
            if gid and gid not in seen_gids:
                seen_gids.add(gid)
                found_groups.append({"id": gid, "name": str(g.get("name") or gid)[:255]})
        row.members = found
        row.groups = found_groups
        if not labs and source == "whatsapp":
            match = next((w for w in wa_labels if w.lower() == (row.name or "").strip().lower()), None)
            if match:
                row.labels = [match]
                for ph in label_to_phones.get(match) or []:
                    if ph not in row.members:
                        row.members.append(ph)
                for g in label_to_groups.get(match) or []:
                    gid = str(g.get("id") or "")
                    if gid and gid not in {str(x.get("id") or "") for x in (row.groups or [])}:
                        row.groups = list(row.groups or []) + [g]

    db.session.commit()

    all_labels = set(wa_labels)
    for c in Contact.query.filter_by(user_id=uid).all():
        for lab in (c.labels or []):
            if str(lab).strip():
                all_labels.add(str(lab).strip())
    for r in ContactList.query.filter_by(user_id=uid).all():
        for lab in (r.labels or []):
            if str(lab).strip():
                all_labels.add(str(lab).strip())

    rows = ContactList.query.filter_by(user_id=uid).order_by(ContactList.position, ContactList.id).all()
    if only_public_id:
        rows = [r for r in rows if r.public_id == only_public_id]

    payload = {
        "lists": [_list_dict(r) for r in rows],
        "waLabels": sorted(all_labels),
        "contactsUpserted": upserted,
        "source": source,
        "labelCount": len(wa_labels),
    }
    if local_err and source == "local":
        payload["warning"] = local_err
    return payload


@bp.route("/api/settings", methods=["GET"])
@login_required
def get_settings():
    uid = _effective_user_id()
    if uid != g.profile.id:
        u = db.session.get(Profile, uid)
    else:
        u = g.profile
    return jsonify({
        "headless": u.headless,
        "delaySeconds": u.delay_seconds,
        "maintenanceMode": maintenance_mode(),
        "siteName": __import__("app.services.users", fromlist=["get_system_setting"]).get_system_setting("site_name", "SSIES Schedule Sender"),
    })


@bp.route("/api/settings", methods=["PUT"])
@login_required
def update_settings():
    data = request.json or {}
    u = g.profile if _effective_user_id() == g.profile.id else db.session.get(Profile, _effective_user_id())
    if "headless" in data:
        u.headless = bool(data["headless"])
    if "delaySeconds" in data:
        try:
            u.delay_seconds = max(0, int(data["delaySeconds"]))
        except (ValueError, TypeError):
            pass
    db.session.commit()
    return jsonify({"headless": u.headless, "delaySeconds": u.delay_seconds})


@bp.route("/api/audit", methods=["GET"])
@login_required
def get_audit():
    uid = g.profile.id
    rows = AuditLog.query.filter_by(actor_id=uid).order_by(AuditLog.created_at.desc()).limit(100).all()
    return jsonify([{
        "action": r.action, "detail": r.detail, "ip": r.ip,
        "at": r.created_at.isoformat(timespec="seconds"),
    } for r in rows])


@bp.route("/api/config", methods=["GET"])
@login_required
def export_config():
    uid = _effective_user_id()
    u = db.session.get(Profile, uid)
    return jsonify({
        "groups": [group_dict(g) for g in Group.query.filter_by(user_id=uid).order_by(Group.position).all()],
        "templates": [template_dict(t) for t in Template.query.filter_by(user_id=uid).order_by(Template.position).all()],
        "contacts": [contact_dict(c) for c in Contact.query.filter_by(user_id=uid).order_by(Contact.position).all()],
        "settings": {"headless": u.headless, "delaySeconds": u.delay_seconds},
    })


@bp.route("/api/config", methods=["PUT"])
@login_required
def import_config():
    data = request.json or {}
    uid = _effective_user_id()
    if "groups" not in data or not isinstance(data["groups"], list):
        return jsonify({"error": "Invalid config: 'groups' list required"}), 400
    Group.query.filter_by(user_id=uid).delete()
    Template.query.filter_by(user_id=uid).delete()
    Contact.query.filter_by(user_id=uid).delete()
    for i, g_item in enumerate(data.get("groups", [])):
        inv = ""
        try:
            inv = _parse_invite_link(g_item)
        except ValueError:
            inv = g_item.get("inviteLink") or ""
        db.session.add(Group(user_id=uid, name=g_item.get("name", ""),
                             nickname=(g_item.get("nickname") or "").strip()[:120],
                             schedule=g_item.get("schedule", []),
                             message_enc=enc(g_item.get("message", "")), last_released=g_item.get("lastReleased", ""),
                             invite_link=inv, position=i))
    for i, t in enumerate(data.get("templates", [])):
        db.session.add(Template(user_id=uid, name=t.get("name", ""), content_enc=enc(t.get("content", "")), position=i))
    for i, c in enumerate(data.get("contacts", [])):
        labels = c.get("labels") if isinstance(c.get("labels"), list) else []
        labels = [str(x).strip() for x in labels if str(x).strip()]
        db.session.add(Contact(user_id=uid, name=c.get("name", ""), phone_enc=enc(digits(c.get("phone"))),
                              message_enc=enc(c.get("message", "")), labels=labels, position=i))
    s = data.get("settings", {})
    u = db.session.get(Profile, uid)
    u.headless = bool(s.get("headless", u.headless))
    u.delay_seconds = int(s.get("delaySeconds", u.delay_seconds))
    db.session.commit()
    audit("config_restore", actor_id=g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/whatsapp/status")
@login_required
def whatsapp_status():
    from app.services.whatsapp_provider import session_info
    info = session_info(user_id=_effective_user_id())
    return jsonify({
        "sessionCached": info.get("connected", False),
        "provider": info.get("provider"),
        "status": info.get("status"),
        "detail": info.get("detail"),
        "slot": info.get("slot"),
        "webUrl": "https://web.whatsapp.com",
    })


@bp.route("/api/whatsapp/session", methods=["GET"])
@login_required
def whatsapp_session():
    from app.services.whatsapp_provider import session_info
    return jsonify(session_info(user_id=_effective_user_id()))


@bp.route("/api/whatsapp/session/start", methods=["POST"])
@login_required
def whatsapp_session_start():
    from app.services.whatsapp_provider import get_provider
    provider = get_provider()
    if provider == "waha":
        from app.services.waha_client import WahaError, start_session
        try:
            return jsonify(start_session(user_id=_effective_user_id()))
        except WahaError as e:
            return jsonify({"error": str(e), "connected": False}), 400
    if provider == "selenium":
        return jsonify({"ok": True, "message": "Use Automated Send to open Chrome and scan QR"})
    return jsonify({"error": "Automation disabled"}), 400


@bp.route("/api/whatsapp/session/qr", methods=["GET"])
@login_required
def whatsapp_session_qr():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "QR available only for WAHA provider"}), 400
    from app.services.waha_client import get_qr
    try:
        return jsonify(get_qr(user_id=_effective_user_id()))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/whatsapp/session/reset", methods=["POST"])
@login_required
def whatsapp_session_reset():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "Reset available only for WAHA provider"}), 400
    from app.services.waha_client import WahaError, reset_session
    try:
        return jsonify(reset_session(user_id=_effective_user_id()))
    except WahaError as e:
        return jsonify({"error": str(e), "connected": False}), 400


@bp.route("/api/whatsapp/session/stop", methods=["POST"])
@login_required
def whatsapp_session_stop():
    from app.services.whatsapp_provider import get_provider
    if get_provider() == "waha":
        from app.services.waha_client import stop_session
        return jsonify(stop_session(user_id=_effective_user_id()))
    return jsonify({"ok": True})


@bp.route("/api/whatsapp/groups", methods=["GET"])
@login_required
def whatsapp_waha_groups():
    from app.services.whatsapp_provider import get_provider
    if get_provider() != "waha":
        return jsonify({"error": "Available only when WAHA provider is active"}), 400
    from app.services.waha_client import WahaError, list_groups, use_waha_user
    try:
        with use_waha_user(_effective_user_id(), assign=False):
            return jsonify({"groups": list_groups()})
    except WahaError as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/whatsapp/links", methods=["GET", "POST"])
@login_required
def whatsapp_links():
    from app.services.whatsapp_links import build_links_for_user
    uid = _effective_user_id()
    if request.method == "POST":
        data = request.json or {}
        targets = data.get("targets")
        groups = data.get("groups")
        contacts = data.get("contacts")
        if targets and not groups and not contacts:
            groups = [t for t in targets if t.get("type", "group") != "contact"]
            contacts = [t for t in targets if t.get("type") == "contact"]
        return jsonify(build_links_for_user(uid, groups=groups, contacts=contacts))
    return jsonify(build_links_for_user(uid))


@bp.route("/api/whatsapp/direct-log", methods=["POST"])
@login_required
def whatsapp_direct_log():
    from app.services.whatsapp_links import log_direct_open
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    log_direct_open(_effective_user_id(), name, data.get("type", "group"), g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/whatsapp/groups/validate", methods=["POST"])
@login_required
def whatsapp_validate_groups():
    data = request.json or {}
    names = data.get("names") or []
    if isinstance(names, str):
        names = [names]
    from app.services.group_validate import validate_group_names
    uid = _effective_user_id()
    validation = validate_group_names(names, user_id=uid)
    # Additive: mark matching groups as WhatsApp-linked (never clear on failure).
    for name, result in (validation or {}).items():
        if result and result.get("ok") is True:
            Group.query.filter_by(user_id=uid, name=name).update(
                {"wa_linked": True}, synchronize_session=False
            )
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({"validation": validation})


@bp.route("/api/release/preflight", methods=["POST"])
@login_required
def release_preflight():
    from app.services.preflight import build_preflight
    data = request.json or {}
    targets = data.get("targets") or []
    uid = _effective_user_id()
    profile = g.profile if uid == g.profile.id else db.session.get(Profile, uid)
    return jsonify(build_preflight(profile or g.profile, targets))


@bp.route("/api/release-history", methods=["GET"])
@login_required
def release_history():
    uid = _effective_user_id()
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = max(int(request.args.get("offset", 0)), 0)
    q = ReleaseLog.query.filter_by(user_id=uid).order_by(ReleaseLog.created_at.desc())
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return jsonify({
        "total": total,
        "items": [
            {
                "id": r.id,
                "targetName": r.target_name,
                "targetType": r.target_type,
                "status": r.status,
                "detail": r.detail or "",
                "at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ],
    })


@bp.route("/api/release/retry", methods=["POST"])
@login_required
def release_retry():
    if maintenance_mode() and not g.profile.is_admin():
        return jsonify({"error": "System is in maintenance mode"}), 503
    uid = _effective_user_id()
    u = db.session.get(Profile, uid)
    data = request.json or {}
    log_id = data.get("id")
    row = ReleaseLog.query.filter_by(id=log_id, user_id=uid).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    if row.status == "success":
        return jsonify({"error": "Already succeeded"}), 400
    targets = [{"name": row.target_name}]
    if row.target_type == "contact":
        for c in Contact.query.filter_by(user_id=uid).all():
            if c.name == row.target_name:
                targets[0]["phone"] = dec(c.phone_enc)
                targets[0]["message"] = dec(c.message_enc) or ""
                break
    else:
        for gr in Group.query.filter_by(user_id=uid, name=row.target_name).all():
            targets[0]["message"] = dec(gr.message_enc) or format_message(gr.schedule)
            break
    if not targets[0].get("message", "").strip():
        return jsonify({"error": "No message content for retry"}), 400
    from flask import current_app
    ok, err = run_release(current_app._get_current_object(), uid, u.headless, u.delay_seconds, targets, g.profile.id)
    if not ok:
        code = 409 if err == "Release already in progress" else 400
        return jsonify({"error": err}), code
    return jsonify({"ok": True})


@bp.route("/api/scheduled-job", methods=["GET", "PUT"])
@login_required
def scheduled_job():
    from app.services.scheduler import parse_schedule, schedule_to_cron
    uid = _effective_user_id()
    job = ScheduledJob.query.filter_by(user_id=uid).first()
    if request.method == "GET":
        if not job:
            return jsonify({
                "enabled": False,
                "dow": 0,
                "hour": 9,
                "minute": 0,
                "lastRunAt": None,
            })
        cfg = parse_schedule(job.cron_expr) or {"dow": 0, "hour": 9, "minute": 0}
        return jsonify({
            "enabled": job.enabled,
            "dow": cfg["dow"],
            "hour": cfg["hour"],
            "minute": cfg["minute"],
            "lastRunAt": job.last_run_at.isoformat() if job.last_run_at else None,
        })
    data = request.json or {}
    enabled = bool(data.get("enabled", False))
    dow = int(data.get("dow", 0))
    hour = int(data.get("hour", 9))
    minute = int(data.get("minute", 0))
    cron_expr = schedule_to_cron(dow, hour, minute)
    if not job:
        job = ScheduledJob(user_id=uid, cron_expr=cron_expr, enabled=enabled)
        db.session.add(job)
    else:
        job.cron_expr = cron_expr
        job.enabled = enabled
    db.session.commit()
    audit("scheduled_job", f"enabled={enabled} dow={dow} {hour}:{minute:02d}", actor_id=g.profile.id)
    return jsonify({"ok": True})


@bp.route("/api/release", methods=["POST"])
@login_required
def release():
    if maintenance_mode() and not g.profile.is_admin():
        return jsonify({"error": "System is in maintenance mode"}), 503

    uid = _effective_user_id()
    u = db.session.get(Profile, uid)
    data = request.json or {}
    targets = data.get("targets")
    if not targets:
        rows = Group.query.filter_by(user_id=uid).order_by(Group.position).all()
        targets = [{"name": g.name, "message": dec(g.message_enc) or format_message(g.schedule)} for g in rows]

    from flask import current_app
    ok, err = run_release(current_app._get_current_object(), uid, u.headless, u.delay_seconds, targets, g.profile.id)
    if not ok:
        code = 409 if err == "Release already in progress" else 400
        return jsonify({"error": err}), code
    return jsonify({"ok": True})


@bp.route("/api/status")
@login_required
def status_stream():
    def gen():
        while True:
            try:
                yield f"data: {status_queue.get(timeout=30)}\n\n"
            except queue.Empty:
                yield "data: ping\n\n"
    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@bp.route("/api/mobile/config", methods=["GET"])
def mobile_config():
    from app.services.users import get_system_setting
    return jsonify({
        "supabaseUrl": Config.SUPABASE_URL,
        "supabaseAnonKey": Config.SUPABASE_ANON_KEY,
        "siteName": get_system_setting("site_name", "SSIES Schedule Sender"),
    })


@bp.route("/health")
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "release_busy": any_release_busy(),
    })


@bp.route("/mobile/download")
def mobile_download_page():
    import os
    from flask import current_app, render_template, send_from_directory

    static_dir = current_app.static_folder or "static"
    apk_name = "ssies-schedule.apk"
    apk_path = os.path.join(static_dir, apk_name)
    has_apk = os.path.isfile(apk_path)
    return render_template("mobile/download.html", has_apk=has_apk, apk_name=apk_name)


@bp.route("/mobile/download/apk")
def mobile_download_apk():
    import os
    from flask import current_app, abort, send_from_directory

    static_dir = current_app.static_folder or "static"
    apk_name = "ssies-schedule.apk"
    apk_path = os.path.join(static_dir, apk_name)
    if not os.path.isfile(apk_path):
        abort(404)
    return send_from_directory(static_dir, apk_name, as_attachment=True, download_name=apk_name)
