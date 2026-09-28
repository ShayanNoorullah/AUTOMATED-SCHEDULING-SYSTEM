-- SSIES Schedule Automation — Phase 3 POC parity
-- Photos, notes, notifications, password requests, passkeys, custom roles
--
-- NOTE on profiles.role:
--   001 created app_role ENUM ('user','admin','superadmin').
--   Custom roles store their key in profiles.role, so we migrate the column to TEXT.
--   Builtin keys user/admin/superadmin remain valid; the app_role type is dropped after conversion.

-- ── profiles: photo + schedule notes; role → TEXT ───────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS table_notes TEXT;

-- Convert app_role enum → TEXT so custom role keys work
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'role' AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE TEXT USING role::TEXT;
    ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END $$;

-- Update helper that returned app_role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Recreate boolean helpers against TEXT role (required before RLS policies below)
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

-- Drop unused enum if nothing references it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    DROP TYPE app_role;
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'app_role enum retained (still referenced elsewhere)';
END $$;

-- ── groups / contacts: photo + WhatsApp linked flag ──────────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS wa_linked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_linked BOOLEAN NOT NULL DEFAULT false;

-- ── notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC);

-- ── password reset requests (admin approval) ────────────────────────────────
-- password_enc: Fernet ciphertext of the requested password (at-rest encryption).
-- Not a one-way hash — plaintext is decrypted on approve for Supabase admin
-- update_user, then the ciphertext is wiped. See app/routes/poc_routes.py.
CREATE TABLE IF NOT EXISTS password_requests (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  password_enc TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS password_requests_status_idx ON password_requests (status);
CREATE INDEX IF NOT EXISTS password_requests_email_idx ON password_requests (email);

-- ── WebAuthn / passkeys ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count INT NOT NULL DEFAULT 0,
  transports JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id);

-- ── roles (builtin + custom) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (key, label, permissions, is_builtin) VALUES
  ('user', 'User', '{"schedule": true, "send": true}'::jsonb, true),
  ('admin', 'Admin', '{"schedule": true, "send": true, "manage_users": true}'::jsonb, true),
  ('superadmin', 'Superadmin', '{"*": true}'::jsonb, true)
ON CONFLICT (key) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications FOR ALL
  USING (user_id = auth.uid() OR is_superadmin());

DROP POLICY IF EXISTS password_requests_admin ON password_requests;
CREATE POLICY password_requests_admin ON password_requests FOR ALL
  USING (is_admin_or_above());

DROP POLICY IF EXISTS password_requests_insert_public ON password_requests;
-- Inserts go through the Flask service role (bypass RLS); no public insert policy needed.

DROP POLICY IF EXISTS webauthn_own ON webauthn_credentials;
CREATE POLICY webauthn_own ON webauthn_credentials FOR ALL
  USING (user_id = auth.uid() OR is_superadmin());

DROP POLICY IF EXISTS roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT USING (true);
DROP POLICY IF EXISTS roles_superadmin ON roles;
CREATE POLICY roles_superadmin ON roles FOR ALL USING (is_superadmin());
