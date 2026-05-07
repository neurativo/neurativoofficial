-- Migration 005: Prevent duplicate starter_grant credits
--
-- Adds a partial unique index so that no user can receive the
-- 'starter_grant' reason more than once, even under concurrent requests.
-- This is the DB-level guard for the race condition in maybe_grant_starter().
--
-- Run this in the Supabase SQL editor (once):

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_starter_grant_per_user
    ON credit_transactions (user_id)
    WHERE reason = 'starter_grant';
