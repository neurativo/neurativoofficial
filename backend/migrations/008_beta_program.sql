-- =============================================================================
-- 008_beta_program.sql  —  Beta Testing Program
-- =============================================================================

-- ── beta_applications ─────────────────────────────────────────────────────────
create table if not exists beta_applications (
    id          uuid        primary key default gen_random_uuid(),
    user_id     text        not null,
    email       text        not null,
    full_name   text,
    subject     text,         -- what they study (e.g. "Computer Science")
    use_case    text,         -- why they want access (max ~300 chars)
    status      text        not null default 'pending',  -- pending | approved | rejected
    approved_at timestamptz,
    expires_at  timestamptz,  -- set at approval: NOW() + INTERVAL '7 days'
    created_at  timestamptz not null default now()
);

create unique index if not exists beta_applications_user_idx on beta_applications(user_id);

-- ── beta_feedback ─────────────────────────────────────────────────────────────
create table if not exists beta_feedback (
    id          uuid        primary key default gen_random_uuid(),
    user_id     text        not null,
    lecture_id  uuid        references lectures(id) on delete set null,
    rating      int         check (rating between 1 and 5),
    comment     text,
    created_at  timestamptz not null default now()
);

-- ── user_subscriptions — add beta_expires_at column ──────────────────────────
alter table user_subscriptions
    add column if not exists beta_expires_at timestamptz;

-- ── Seed beta_enabled setting ─────────────────────────────────────────────────
insert into app_settings (key, value, updated_at)
values ('beta_enabled', 'false'::jsonb, now())
on conflict (key) do nothing;
