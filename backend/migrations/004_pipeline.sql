-- 004_pipeline.sql
-- Run in Supabase SQL editor after 001, 002, and 003
-- Requires: lectures table (created by 001_initial_schema.sql)
-- Safe to run on existing databases (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ── processing_jobs ───────────────────────────────────────────────────────────
create table if not exists processing_jobs (
    id           uuid primary key default gen_random_uuid(),
    lecture_id   uuid not null unique,
    user_id      text not null,
    status       text not null default 'queued',
    -- queued | compressing | transcribing | cleaning | generating | storing | done | failed
    step_detail  text,           -- human-readable current step label
    error        text,           -- set when status = 'failed'
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists idx_pjobs_user     on processing_jobs(user_id);
create index if not exists idx_pjobs_status   on processing_jobs(status);
create index if not exists idx_pjobs_lecture  on processing_jobs(lecture_id);

-- ── Generated content columns on lectures ─────────────────────────────────────
alter table lectures
    add column if not exists flashcards  jsonb,  -- [{front, back}]
    add column if not exists quiz        jsonb,  -- [{question, options[4], answer, explanation}]
    add column if not exists glossary    jsonb;  -- [{term, definition}]

-- ── Retention flag ────────────────────────────────────────────────────────────
alter table lectures
    add column if not exists deletion_scheduled_at timestamptz,
    add column if not exists content_deleted        boolean not null default false;
