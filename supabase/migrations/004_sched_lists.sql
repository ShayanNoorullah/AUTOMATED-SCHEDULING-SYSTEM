-- Scheduler nicknames + WhatsApp label Lists (004)
-- Safe to re-run.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS nickname VARCHAR(120) DEFAULT '';

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS contact_lists (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  public_id VARCHAR(40) NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) DEFAULT '#0d9488',
  labels JSONB DEFAULT '[]'::jsonb,
  members JSONB DEFAULT '[]'::jsonb,
  message_enc TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_lists_user_idx ON contact_lists (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS contact_lists_user_public_idx ON contact_lists (user_id, public_id);

ALTER TABLE contact_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_lists_own ON contact_lists;
CREATE POLICY contact_lists_own ON contact_lists FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
