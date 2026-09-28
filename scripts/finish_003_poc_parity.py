"""Repair + finish 003_poc_parity after is_superadmin() missing."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.upper().startswith("REM "):
            continue
        if s.lower().startswith("set "):
            s = s[4:].strip()
        if "=" not in s:
            continue
        k, _, v = s.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


REPAIR_SQL = r"""
-- Recreate helpers for TEXT profiles.role (after enum drop)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'superadmin' AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin') AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
"""


def connect(url: str):
    import psycopg2

    candidates = [url]
    if ":6543/" in url:
        candidates.append(url.replace(":6543/", ":5432/"))
    m = re.search(r"postgres\.([a-z0-9]+):", url)
    pw = re.search(r":([^:@]+)@", url)
    if m and pw:
        candidates.append(
            f"postgresql://postgres:{pw.group(1)}@db.{m.group(1)}.supabase.co:5432/postgres?sslmode=require"
        )
    last = None
    for cand in candidates:
        try:
            return psycopg2.connect(cand, connect_timeout=25)
        except Exception as e:
            last = e
    raise RuntimeError(last)


def main() -> int:
    load_env(ROOT / ".env")
    load_env(ROOT / "run.local.bat")
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("ERROR: no DATABASE_URL")
        return 1

    sql = (ROOT / "supabase" / "migrations" / "003_poc_parity.sql").read_text(encoding="utf-8")
    conn = connect(url)
    conn.autocommit = True
    print("Connected")
    try:
        with conn.cursor() as cur:
            cur.execute(REPAIR_SQL)
            print("OK: helper functions recreated")
            cur.execute(sql)
            print("OK: 003_poc_parity.sql applied")
            cur.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public'
                  AND table_name IN ('notifications','password_requests','webauthn_credentials','roles')
                ORDER BY 1
                """
            )
            print("Tables:", ", ".join(r[0] for r in cur.fetchall()))
            cur.execute("SELECT key, is_builtin FROM roles ORDER BY id")
            print("Roles:", ", ".join(f"{r[0]}{'*' if r[1] else ''}" for r in cur.fetchall()))
        return 0
    except Exception as e:
        print("ERROR:", e)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
