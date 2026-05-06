-- ============================================================
-- Neurativo — Initial Schema (001)
-- Run this FIRST on any fresh Supabase project.
-- Safe to re-run on existing databases (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout).
-- After this, run 002, 003, 004 in order.
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Stores per-user settings and stats. id = Clerk user ID (text).
create table if not exists profiles (
    id                       text primary key,   -- Clerk user ID (e.g. user_abc123)
    email                    text,
    full_name                text,
    display_name             text,
    avatar_url               text,
    preferred_language       text    default 'en',
    pdf_auto_download        boolean default true,
    total_hours_recorded     float   default 0,
    total_words_transcribed  int     default 0,
    uploads_this_month       int     default 0,
    created_at               timestamptz not null default now()
);

-- ── lectures ──────────────────────────────────────────────────────────────────
create table if not exists lectures (
    id                      uuid        primary key default gen_random_uuid(),
    title                   text,
    transcript              text,
    master_summary          text,
    summary                 text,
    language                text        default 'en',
    topic                   text,
    duration_seconds        int,
    total_chunks            int         default 0,
    total_sections          int         default 0,
    total_duration_seconds  int         default 0,
    word_count              int         default 0,
    user_id                 text,       -- Clerk user ID (text, not UUID)
    summary_status          text        default 'pending',
    share_token             text        unique,
    share_views             int         default 0,
    share_mode              text        default 'full',
    share_expires_at        timestamptz,
    processing_lock         boolean     not null default false,
    credit_deducted         boolean     not null default false,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists idx_lectures_user_id on lectures(user_id);
create index if not exists idx_lectures_created on lectures(created_at desc);

-- ── live_sessions ─────────────────────────────────────────────────────────────
create table if not exists live_sessions (
    id            uuid        primary key default gen_random_uuid(),
    lecture_id    uuid        references lectures(id) on delete cascade,
    is_active     boolean     not null default true,
    last_chunk_at timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists idx_live_sessions_lecture on live_sessions(lecture_id);

-- ── lecture_chunks ────────────────────────────────────────────────────────────
create table if not exists lecture_chunks (
    id            uuid        primary key default gen_random_uuid(),
    lecture_id    uuid        references lectures(id) on delete cascade,
    transcript    text        not null,
    micro_summary text,
    chunk_index   int         not null default 0,
    created_at    timestamptz not null default now()
);

create index if not exists idx_chunks_lecture on lecture_chunks(lecture_id);
create index if not exists idx_chunks_index   on lecture_chunks(lecture_id, chunk_index);

-- ── lecture_sections ──────────────────────────────────────────────────────────
create table if not exists lecture_sections (
    id                uuid        primary key default gen_random_uuid(),
    lecture_id        uuid        references lectures(id) on delete cascade,
    section_summary   text        not null,
    chunk_range_start int         not null,
    chunk_range_end   int         not null,
    section_index     int         not null default 0,
    created_at        timestamptz not null default now(),
    unique (lecture_id, section_index)
);

create index if not exists idx_sections_lecture on lecture_sections(lecture_id);

-- ── lecture_questions (CIF — Content Intelligence Filter) ─────────────────────
create table if not exists lecture_questions (
    id            uuid        primary key default gen_random_uuid(),
    lecture_id    uuid        references lectures(id) on delete cascade,
    question_text text        not null,
    detected_at   timestamptz not null default now()
);

-- ── lecture_embeddings (QA chunk cache) ───────────────────────────────────────
create table if not exists lecture_embeddings (
    id          uuid        primary key default gen_random_uuid(),
    lecture_id  uuid        references lectures(id) on delete cascade,
    chunk_hash  text        not null,
    chunk_text  text,
    embedding   jsonb,
    created_at  timestamptz not null default now(),
    unique (lecture_id, chunk_hash)
);

create index if not exists idx_embeddings_lecture on lecture_embeddings(lecture_id);

-- ── lecture_visual_frames ─────────────────────────────────────────────────────
create table if not exists lecture_visual_frames (
    id                uuid        primary key default gen_random_uuid(),
    lecture_id        uuid        references lectures(id) on delete cascade,
    timestamp_seconds int         not null default 0,
    content_type      text,
    title             text,
    text_content      text,
    equations         jsonb,
    diagrams          jsonb,
    code              text,
    key_terms         jsonb,
    summary           text,
    formatted_text    text,
    source            text,
    created_at        timestamptz not null default now()
);

create index if not exists idx_visual_frames_lecture on lecture_visual_frames(lecture_id);

-- ── user_subscriptions ────────────────────────────────────────────────────────
-- plan_tier: 'free' | 'student' | 'pro'
create table if not exists user_subscriptions (
    user_id     text        primary key,  -- Clerk user ID
    plan_tier   text        not null default 'free',
    is_suspended boolean    not null default false,
    updated_at  timestamptz not null default now()
);

-- ── monthly_usage ─────────────────────────────────────────────────────────────
create table if not exists monthly_usage (
    id                uuid        primary key default gen_random_uuid(),
    user_id           text        not null,
    year_month        text        not null,   -- 'YYYY-MM'
    live_lectures     int         not null default 0,
    uploads           int         not null default 0,
    total_minutes_used int        not null default 0,
    unique (user_id, year_month)
);

create index if not exists idx_monthly_usage_user on monthly_usage(user_id);

-- ── api_cost_logs ─────────────────────────────────────────────────────────────
create table if not exists api_cost_logs (
    id            uuid          primary key default gen_random_uuid(),
    created_at    timestamptz   not null default now(),
    feature       text          not null,
    model         text          not null,
    cost_usd      numeric(12,8) not null default 0,
    input_tokens  int           not null default 0,
    output_tokens int           not null default 0,
    audio_seconds numeric(10,3) not null default 0,
    image_count   int           not null default 0,
    user_id       text,
    lecture_id    uuid,
    plan_tier     text
);

create index if not exists idx_cost_logs_created on api_cost_logs(created_at desc);
create index if not exists idx_cost_logs_feature on api_cost_logs(feature);

-- ── audit_logs ────────────────────────────────────────────────────────────────
create table if not exists audit_logs (
    id        uuid        primary key default gen_random_uuid(),
    timestamp timestamptz not null default now(),
    admin_id  text        not null,
    action    text        not null,
    target_id text,
    detail    text
);

create index if not exists idx_audit_logs_time on audit_logs(timestamp desc);

-- ── announcements ─────────────────────────────────────────────────────────────
create table if not exists announcements (
    id         bigint      primary key generated always as identity,
    text       text        not null,
    ann_type   text        not null default 'info',
    expires_at timestamptz,
    created_by text,
    created_at timestamptz not null default now()
);

-- ── app_settings (admin key-value store) ──────────────────────────────────────
create table if not exists app_settings (
    key        text        primary key,
    value      jsonb,
    updated_at timestamptz not null default now()
);

-- ── RPC: increment_lecture_analytics ─────────────────────────────────────────
-- Used by live session chunk processing to atomically bump total_chunks + duration.
create or replace function increment_lecture_analytics(
    p_lecture_id uuid,
    p_duration   integer
) returns void language plpgsql as $$
begin
    update lectures
       set total_chunks           = coalesce(total_chunks, 0) + 1,
           total_duration_seconds = coalesce(total_duration_seconds, 0) + p_duration
     where id = p_lecture_id;
end;
$$;

-- ── Add any columns that may be missing on existing databases ─────────────────
alter table lectures add column if not exists share_mode       text        default 'full';
alter table lectures add column if not exists share_expires_at timestamptz;
alter table lectures add column if not exists processing_lock  boolean     not null default false;
alter table lectures add column if not exists credit_deducted  boolean     not null default false;
alter table lecture_chunks   add column if not exists chunk_index   int not null default 0;
alter table lecture_sections add column if not exists section_index int not null default 0;
alter table lecture_visual_frames add column if not exists source text;
alter table profiles add column if not exists uploads_this_month int default 0;
