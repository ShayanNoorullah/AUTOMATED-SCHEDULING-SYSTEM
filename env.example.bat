@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  Copy this file to "env.bat" and fill in your values for multi-device sync.
REM  env.bat is loaded automatically by run.bat (and is git-ignored).
REM  See README.md "PostgreSQL Setup (Cloud)" for step-by-step provider guides.
REM ════════════════════════════════════════════════════════════════════════

REM 1) Cloud PostgreSQL connection string (Neon / Supabase / Railway / etc.)
REM    Leave unset to use a local SQLite file (instance\app.db) instead.
set DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require

REM 2) Encryption key for data-at-rest. MUST be the SAME on every device that
REM    shares the database, or messages/contacts won't decrypt.
REM    Generate one with:  python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
set APP_ENCRYPTION_KEY=PASTE_YOUR_FERNET_KEY_HERE

REM 3) Flask session secret (any long random string). Keep it consistent.
set APP_SECRET_KEY=PASTE_A_LONG_RANDOM_STRING_HERE

REM 4) Set to 1 only if you serve the app over HTTPS (secure cookies).
REM set FORCE_HTTPS=1
