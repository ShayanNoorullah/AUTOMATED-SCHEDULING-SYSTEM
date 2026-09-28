-- Add groups JSON to contact_lists (labeled WhatsApp groups on a list)
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS groups JSONB DEFAULT '[]'::jsonb;
