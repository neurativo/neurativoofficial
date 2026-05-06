-- Neurativo Credits System — migration
-- Run in Supabase SQL editor after 001 and 002
-- Requires: lectures and profiles tables (created by 001_initial_schema.sql)
-- Safe to run on existing databases (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout)

-- ── Add credit fields to profiles ─────────────────────────────────────────────
alter table profiles
    add column if not exists credits               int          not null default 0,
    add column if not exists credits_sub_status    text         not null default 'none',  -- none | monthly
    add column if not exists credits_sub_started   timestamptz,
    add column if not exists credits_sub_expires   timestamptz,
    -- Purchase intent log (no-Stripe placeholder)
    add column if not exists last_purchase_intent  jsonb;

-- ── Add processing lock + processed flag to lectures ──────────────────────────
alter table lectures
    add column if not exists processing_lock   boolean not null default false,
    add column if not exists credit_deducted   boolean not null default false;

-- ── Credit transactions ───────────────────────────────────────────────────────
create table if not exists credit_transactions (
    id            uuid primary key default gen_random_uuid(),
    user_id       text not null,
    amount        int  not null,        -- positive = added, negative = deducted
    balance_after int  not null,
    reason        text not null,        -- starter_grant | pack_purchase | monthly_refresh | plan_grant | lecture_processed | refund
    product       text,                 -- small_pack | large_pack | monthly_sub | student_grant | pro_grant
    lecture_id    uuid,                 -- set when reason = lecture_processed | refund
    created_at    timestamptz not null default now()
);

create index if not exists idx_credit_tx_user   on credit_transactions(user_id);
create index if not exists idx_credit_tx_lec    on credit_transactions(lecture_id);
create index if not exists idx_credit_tx_time   on credit_transactions(user_id, created_at desc);

-- ── Purchase intent log ───────────────────────────────────────────────────────
create table if not exists purchase_intents (
    id         uuid primary key default gen_random_uuid(),
    user_id    text not null,
    product    text not null,   -- small_pack | large_pack | monthly_sub
    price_usd  numeric(8,2),
    credits    int,
    status     text not null default 'pending',   -- pending | completed | cancelled
    created_at timestamptz not null default now()
);

create index if not exists idx_purchase_intents_user on purchase_intents(user_id);
