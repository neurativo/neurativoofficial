-- Migration 011 — Dodo Payments billing fields
-- Run once in Supabase SQL editor

ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS dodo_customer_id       TEXT,
    ADD COLUMN IF NOT EXISTS dodo_subscription_id   TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status    TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_subs_dodo_sub
    ON user_subscriptions(dodo_subscription_id)
    WHERE dodo_subscription_id IS NOT NULL;
