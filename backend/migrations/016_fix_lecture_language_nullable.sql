-- ============================================================
-- 016_fix_lecture_language_nullable.sql
--
-- Root-cause fix for POST /api/v1/live/start returning 500.
--
-- The live-session flow intentionally creates a lecture with language = NULL
-- (empty string is coerced to NULL in save_lecture) so a session is not
-- pre-locked to "en" before the first transcript chunk detects the real
-- language. However this database had a NOT NULL constraint on
-- lectures.language, so the INSERT failed and the endpoint 500'd.
--
-- Migration 001 already defines language as `text default 'en'` (nullable);
-- this aligns an out-of-sync production database with that intent.
-- Safe to re-run.
-- ============================================================

ALTER TABLE lectures ALTER COLUMN language DROP NOT NULL;
