@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  Copy this file to "run.local.bat" and fill in your values.
REM  run.local.bat is git-ignored and loaded by run.bat.
REM  See README.md for Supabase setup instructions.
REM ════════════════════════════════════════════════════════════════════════

REM ── Supabase (Dashboard → Project Settings → API) ──
set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
set SUPABASE_ANON_KEY=YOUR_ANON_KEY
set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
set SUPABASE_JWT_SECRET=YOUR_JWT_SECRET

REM ── Database (Connection string → URI → pooler) ──
set DATABASE_URL=postgresql://postgres.YOUR_PROJECT:YOUR_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require

REM ── Superadmin email (must match Supabase Auth user) ──
set SUPERADMIN_EMAIL=you@example.com

REM ── App secrets (generate — see README) ──
set APP_ENCRYPTION_KEY=PASTE_FERNET_KEY_HERE
set APP_SECRET_KEY=PASTE_RANDOM_SECRET_HERE

REM ── Run settings ──
set PORT=5000
set HOST=0.0.0.0
REM set USE_WAITRESS=1
REM set FORCE_HTTPS=1
