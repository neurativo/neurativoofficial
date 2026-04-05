-- Share options migration
-- Run this in the Supabase SQL editor

ALTER TABLE lectures
    ADD COLUMN IF NOT EXISTS share_mode TEXT DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;
