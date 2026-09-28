"""Apply migration + set WEBAUTHN env. Never print secrets."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> dict:
    data = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.upper().startswith("REM "):
            continue
        if s.lower().startswith("set "):
            s = s[4:].strip()
        if "=" not in s:
            continue
        k, _, v = s.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            data[k] = v
    return data


def upsert(path: Path, updates: dict) -> None:
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = text.splitlines()
    seen = set()
    out = []
    for line in lines:
        s = line.strip()
        prefix = ""
        body = s
        if s.lower().startswith("set "):
            prefix = "set "
            body = s[4:].strip()
        if body and not body.startswith("#") and not body.upper().startswith("REM ") and "=" in body:
            k = body.split("=", 1)[0].strip()
            if k in updates:
                out.append(f"{prefix}{k}={updates[k]}")
                seen.add(k)
                continue
        out.append(line)
    missing = [k for k in updates if k not in seen]
    if missing:
        if out and out[-1].strip():
            out.append("")
        out.append("# WebAuthn / passkeys")
        for k in missing:
            out.append(f"{k}={updates[k]}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Updated {path.name} keys: {', '.join(updates)}")


def main() -> int:
    env = {}
    env.update(load_env_file(ROOT / ".env"))
    env.update(load_env_file(ROOT / "run.local.bat"))
    # Prefer process env overrides
    for k, v in list(env.items()):
        os.environ.setdefault(k, v)

    url = os.environ.get("DATABASE_URL", "").strip()
    print("DATABASE_URL present:", bool(url and not url.startswith("sqlite")))
    if url:
        host = re.search(r"@([^/:]+)", url)
        print("DB host:", host.group(1) if host else "(parse failed)")

    # WebAuthn
    domain = env.get("DUCKDNS_DOMAIN") or "localhost"
    origin = f"https://{domain}" if domain != "localhost" else "http://localhost:5000"
    updates = {"WEBAUTHN_RP_ID": domain, "WEBAUTHN_ORIGIN": origin}
    print(f"WEBAUTHN_RP_ID={domain}")
    print(f"WEBAUTHN_ORIGIN={origin}")
    upsert(ROOT / ".env", updates)
    upsert(
        ROOT / ".env.production.example",
        {
            "WEBAUTHN_RP_ID": "ssies-schedule.duckdns.org",
            "WEBAUTHN_ORIGIN": "https://ssies-schedule.duckdns.org",
        },
    )

    if not url or url.startswith("sqlite"):
        print("ERROR: no Postgres DATABASE_URL — migration skipped")
        return 1

    # Re-run migration with env loaded into process
    sys.path.insert(0, str(ROOT / "scripts"))
    # Inline connect to avoid re-import issues
    import psycopg2

    sql = (ROOT / "supabase" / "migrations" / "003_poc_parity.sql").read_text(encoding="utf-8")
    candidates = [url]
    if ":6543/" in url:
        candidates.append(url.replace(":6543/", ":5432/"))
    m = re.search(r"postgres\.([a-z0-9]+):", url)
    pw = re.search(r":([^:@]+)@", url)
    if m and pw:
        ref = m.group(1)
        candidates.append(
            f"postgresql://postgres:{pw.group(1)}@db.{ref}.supabase.co:5432/postgres?sslmode=require"
        )

    conn = None
    last_err = None
    for cand in candidates:
        try:
            conn = psycopg2.connect(cand, connect_timeout=25)
            h = re.search(r"@([^/:]+)", cand)
            print("Connected:", h.group(1) if h else "ok")
            break
        except Exception as e:
            last_err = e
    if not conn:
        print("ERROR connect:", last_err)
        return 1

    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("OK: migration applied")
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public'
                  AND table_name IN ('notifications','password_requests','webauthn_credentials','roles')
                ORDER BY 1
                """
            )
            print("Tables:", ", ".join(r[0] for r in cur.fetchall()) or "(none)")
        return 0
    except Exception as e:
        print("ERROR SQL:", e)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
