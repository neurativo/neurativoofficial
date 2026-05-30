-- Migration 013: Add scheduled_at and linked_flag_keys to feature_releases
-- scheduled_at: auto-publish at this UTC timestamp (NULL = manual only)
-- linked_flag_keys: feature_flags.key values to enable on publish / disable on unpublish

ALTER TABLE feature_releases
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_flag_keys TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS feature_releases_scheduled
  ON feature_releases (scheduled_at)
  WHERE published_at IS NULL AND scheduled_at IS NOT NULL;
