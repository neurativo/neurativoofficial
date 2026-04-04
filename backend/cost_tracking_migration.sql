-- Cost tracking tables for Neurativo Admin Panel
-- Run this once in your Supabase SQL editor

-- 1. API cost logs — one row per OpenAI API call
CREATE TABLE IF NOT EXISTS api_cost_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    feature       TEXT        NOT NULL,                -- e.g. 'whisper_transcription', 'micro_summary'
    model         TEXT        NOT NULL,                -- e.g. 'whisper-1', 'gpt-4o-mini'
    cost_usd      NUMERIC(12,8) NOT NULL DEFAULT 0,
    input_tokens  INT         NOT NULL DEFAULT 0,
    output_tokens INT         NOT NULL DEFAULT 0,
    audio_seconds NUMERIC(10,3) NOT NULL DEFAULT 0,
    image_count   INT         NOT NULL DEFAULT 0,
    user_id       TEXT,                               -- Clerk user ID (optional)
    lecture_id    UUID,                              -- lecture FK (optional, no constraint for flexibility)
    plan_tier     TEXT                               -- 'free' | 'student' | 'pro'
);

-- Index for the admin dashboard queries
CREATE INDEX IF NOT EXISTS api_cost_logs_created_at_idx ON api_cost_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS api_cost_logs_feature_idx    ON api_cost_logs (feature);
CREATE INDEX IF NOT EXISTS api_cost_logs_user_id_idx    ON api_cost_logs (user_id) WHERE user_id IS NOT NULL;

-- 2. Optional: admin users table (if you use Supabase-based admin auth instead of env var)
-- CREATE TABLE IF NOT EXISTS admin_users (
--     user_id    TEXT PRIMARY KEY,  -- Clerk user ID
--     added_at   TIMESTAMPTZ DEFAULT now(),
--     added_by   TEXT
-- );
