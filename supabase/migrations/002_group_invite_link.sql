-- Optional WhatsApp group invite link for direct-open in browser
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_link TEXT NOT NULL DEFAULT '';
