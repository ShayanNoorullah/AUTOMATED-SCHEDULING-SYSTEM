-- SSIES Schedule Automation — initial schema with RBAC
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

CREATE TYPE app_role AS ENUM ('user', 'admin', 'superadmin');

-- ── Profiles (extends auth.users) ───────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role app_role NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  headless BOOLEAN NOT NULL DEFAULT false,
  delay_seconds INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX one_superadmin ON profiles (role) WHERE role = 'superadmin';
CREATE INDEX profiles_role_idx ON profiles (role);
CREATE INDEX profiles_email_idx ON profiles (email);

-- ── Schedule data ───────────────────────────────────────────────────────────
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule JSONB NOT NULL DEFAULT '[]',
  message_enc TEXT NOT NULL DEFAULT '',
  last_released TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX groups_user_id_idx ON groups (user_id);

CREATE TABLE templates (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_enc TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX templates_user_id_idx ON templates (user_id);

CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_enc TEXT NOT NULL DEFAULT '',
  message_enc TEXT NOT NULL DEFAULT '',
  last_released TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX contacts_user_id_idx ON contacts (user_id);

-- ── Audit & release history ───────────────────────────────────────────────────
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

CREATE TABLE release_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_name TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'group',
  status TEXT NOT NULL DEFAULT 'success',
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX release_log_user_idx ON release_log (user_id);
CREATE INDEX release_log_created_idx ON release_log (created_at DESC);

-- ── System settings (superadmin) ──────────────────────────────────────────────
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('site_name', '"SSIES Schedule Sender"'),
  ('default_delay_seconds', '5'),
  ('allow_user_creation', 'true');

-- ── Scheduled jobs (future-ready) ─────────────────────────────────────────────
CREATE TABLE scheduled_jobs (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cron_expr TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Helper: current user role ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin' AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin') AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (id = auth.uid() OR is_superadmin() OR (is_admin_or_above() AND role = 'user'));
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_superadmin_all ON profiles FOR ALL USING (is_superadmin());

-- Groups / templates / contacts — own data or superadmin
CREATE POLICY groups_own ON groups FOR ALL USING (user_id = auth.uid() OR is_superadmin());
CREATE POLICY templates_own ON templates FOR ALL USING (user_id = auth.uid() OR is_superadmin());
CREATE POLICY contacts_own ON contacts FOR ALL USING (user_id = auth.uid() OR is_superadmin());

-- Audit log
CREATE POLICY audit_select_own ON audit_log FOR SELECT USING (actor_id = auth.uid() OR is_superadmin() OR (is_admin_or_above() AND target_id IN (SELECT id FROM profiles WHERE role = 'user')));
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (actor_id = auth.uid() OR is_superadmin());

-- Release log
CREATE POLICY release_log_own ON release_log FOR SELECT USING (user_id = auth.uid() OR is_superadmin());
CREATE POLICY release_log_insert ON release_log FOR INSERT WITH CHECK (user_id = auth.uid() OR is_superadmin());

-- System settings — superadmin only
CREATE POLICY system_settings_superadmin ON system_settings FOR ALL USING (is_superadmin());

-- Scheduled jobs
CREATE POLICY scheduled_jobs_own ON scheduled_jobs FOR ALL USING (user_id = auth.uid() OR is_superadmin());

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
