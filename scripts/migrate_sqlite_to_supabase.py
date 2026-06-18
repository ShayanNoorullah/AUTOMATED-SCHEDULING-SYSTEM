#!/usr/bin/env python3
"""Optional migration helper: export SQLite data and import into Supabase.

Requires env.bat with Supabase credentials configured.
Run: python scripts/migrate_sqlite_to_supabase.py

This script is a starting point — review exported JSON before importing.
"""
import json
import os
import sqlite3
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

SQLITE_PATH = os.path.join(BASE, "instance", "app.db")
OUT_PATH = os.path.join(BASE, "instance", "sqlite_export.json")


def export_sqlite():
    if not os.path.exists(SQLITE_PATH):
        print("No SQLite database at", SQLITE_PATH)
        return None
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    data = {"users": [], "groups": [], "templates": [], "contacts": []}
    for row in conn.execute("SELECT * FROM user"):
        data["users"].append(dict(row))
    for table in ("group", "template", "contact"):
        try:
            for row in conn.execute(f"SELECT * FROM {table}"):
                data[table + "s" if table != "group" else "groups"].append(dict(row))
        except sqlite3.OperationalError:
            pass
    conn.close()
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    print("Exported to", OUT_PATH)
    return data


if __name__ == "__main__":
    export_sqlite()
    print("Create Supabase users via admin portal, then manually import schedule data.")
