"""Apply 003_poc_parity.sql using DATABASE_URL from .env / environment. No secret printing."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        # support SET VAR= and VAR=
        if line.lower().startswith("set "):
            line = line[4:].strip()
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def main() -> int:
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "run.local.bat")  # may contain set VAR=...

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url or url.startswith("sqlite"):
        print("ERROR: DATABASE_URL not set to Postgres. Cannot run Supabase migration.")
        return 1

    # Never print full URL
    host = re.search(r"@([^/:]+)", url)
    print(f"Connecting to host: {host.group(1) if host else '(unknown)'} …")

    sql_path = ROOT / "supabase" / "migrations" / "003_poc_parity.sql"
    sql = sql_path.read_text(encoding="utf-8")

    try:
        import psycopg2
    except ImportError:
        print("Installing psycopg2-binary…")
        import subprocess

        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
        import psycopg2

    # Pooler (6543) sometimes rejects multi-statement; prefer direct 5432 if available
    connect_url = url
    conn = None
    last_err = None
    candidates = [url]
    if ":6543/" in url:
        candidates.append(url.replace(":6543/", ":5432/"))
    if "pooler.supabase.com" in url:
        # also try db.*.supabase.co style if project ref present
        m = re.search(r"postgres\.([a-z0-9]+):", url)
        if m:
            ref = m.group(1)
            pw = re.search(r":([^:@]+)@", url)
            if pw:
                candidates.append(
                    f"postgresql://postgres:{pw.group(1)}@db.{ref}.supabase.co:5432/postgres?sslmode=require"
                )

    for cand in candidates:
        try:
            conn = psycopg2.connect(cand, connect_timeout=20)
            # mask
            h = re.search(r"@([^/:]+)", cand)
            print(f"Connected via {h.group(1) if h else 'db'}")
            break
        except Exception as e:
            last_err = e
            continue

    if conn is None:
        print(f"ERROR: could not connect: {last_err}")
        return 1

    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("OK: 003_poc_parity.sql applied.")
        # quick verify
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public'
                  AND table_name IN ('notifications','password_requests','webauthn_credentials','roles')
                ORDER BY 1
                """
            )
            tables = [r[0] for r in cur.fetchall()]
            print("Tables present:", ", ".join(tables) if tables else "(none)")
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name='profiles'
                  AND column_name IN ('photo_path','table_notes','role')
                ORDER BY 1
                """
            )
            cols = [r[0] for r in cur.fetchall()]
            print("profiles columns:", ", ".join(cols))
        return 0
    except Exception as e:
        print(f"ERROR applying migration: {e}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
