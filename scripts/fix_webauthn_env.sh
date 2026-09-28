#!/bin/bash
# Upsert WebAuthn HTTPS origin on the existing Always Free VM .env (no secrets printed).
set -euo pipefail
cd ~/ssies
test -f .env
RP_ID="${WEBAUTHN_RP_ID_VALUE:-ssies-schedule.duckdns.org}"
ORIGIN="${WEBAUTHN_ORIGIN_VALUE:-https://ssies-schedule.duckdns.org}"

python3 - <<'PY'
from pathlib import Path
import os
path = Path(".env")
text = path.read_text(encoding="utf-8", errors="replace")
updates = {
    "WEBAUTHN_RP_ID": os.environ.get("WEBAUTHN_RP_ID_VALUE", "ssies-schedule.duckdns.org"),
    "WEBAUTHN_ORIGIN": os.environ.get("WEBAUTHN_ORIGIN_VALUE", "https://ssies-schedule.duckdns.org"),
}
lines = text.splitlines()
seen = set()
out = []
for line in lines:
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k = s.split("=", 1)[0].strip()
        if k in updates:
            out.append(f"{k}={updates[k]}")
            seen.add(k)
            continue
    out.append(line)
for k, v in updates.items():
    if k not in seen:
        out.append(f"{k}={v}")
path.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
print("WEBAUTHN_ENV_UPSERTED")
# Verify scheme only — do not print full values
for k in updates:
    val = updates[k]
    if k == "WEBAUTHN_ORIGIN":
        print("origin_scheme", "https" if val.startswith("https://") else "OTHER")
    else:
        print("rp_id_set", bool(val))
PY
