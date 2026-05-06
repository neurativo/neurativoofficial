-- 004_pipeline.sql
-- Run in Supabase SQL editor after 003
-- Safe to run on existing databases (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ── lectures table (create if it doesn't exist yet) ───────────────────────────
-- This is a no-op on production databases where the table already exists.
-- On fresh setups, this creates the full table so the ALTER statements below work.
create table if not exists lectures (
    id                      uuid primary key default gen_random_uuid(),
    title                   text,
    transcript              text,
    master_summary          text,
    summary                 text,
    language                text default 'en',
    topic                   text,
    duration_seconds        int,
    total_chunks            int  default 0,
    total_sections          int  default 0,
    total_duration_seconds  int  default 0,
    word_count              int  default 0,
    user_id                 text,
    summary_status          text default 'pending',
    share_token             text unique,
    share_views             int  default 0,
    processing_lock         boolean not null default false,
    credit_deducted         boolean not null default false,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists idx_lectures_user_id on lectures(user_id);
create index if not exists idx_lectures_created on lectures(created_at desc);

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
