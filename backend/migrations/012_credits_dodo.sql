-- Migration 012 — Add Dodo payment tracking to purchase_intents
-- Run once in Supabase SQL editor

ALTER TABLE purchase_intents
    ADD COLUMN IF NOT EXISTS dodo_session_id  TEXT,
    ADD COLUMN IF NOT EXISTS dodo_payment_id  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_intents_session
    ON purchase_intents(dodo_session_id)
    WHERE dodo_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_intents_payment
    ON purchase_intents(dodo_payment_id)
    WHERE dodo_payment_id IS NOT NULL;
