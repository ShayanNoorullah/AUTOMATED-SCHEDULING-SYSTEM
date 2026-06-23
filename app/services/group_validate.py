"""Validate SSIES group names against linked WAHA WhatsApp groups."""
from app.services.whatsapp_provider import get_provider


def validate_group_names(names):
    """Return {name: {ok, match, similar}} for each name."""
    names = [n.strip() for n in names if (n or "").strip()]
    if not names:
        return {}

    provider = get_provider()
    if provider != "waha":
        return {n: {"ok": None, "match": None, "similar": [], "note": "WAHA not active"} for n in names}

    from app.services.waha_client import WahaError, _norm_name, list_groups

    try:
        wa_groups = list_groups()
    except WahaError as e:
        return {n: {"ok": False, "match": None, "similar": [], "error": str(e)} for n in names}

    wa_by_norm = {_norm_name(g["name"]): g["name"] for g in wa_groups}
    wa_names = list(wa_by_norm.values())
    out = {}
    for name in names:
        nn = _norm_name(name)
        exact = wa_by_norm.get(nn)
        if exact:
            out[name] = {"ok": True, "match": exact, "similar": []}
            continue
        similar = [
            w for w in wa_names
            if nn in _norm_name(w) or _norm_name(w) in nn
        ][:5]
        out[name] = {"ok": False, "match": None, "similar": similar}
    return out
