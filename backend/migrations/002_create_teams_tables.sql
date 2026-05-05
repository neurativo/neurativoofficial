-- Neurativo Teams — migration
-- Run in Supabase SQL editor

-- ── organizations ─────────────────────────────────────────────────────────────
create table if not exists organizations (
    id                    uuid primary key default gen_random_uuid(),
    slug                  text unique not null,
    name                  text not null,
    logo_url              text,
    owner_id              text not null,             -- Clerk user ID
    stripe_customer_id    text,
    stripe_subscription_id text,
    seat_limit            int not null default 0,    -- total purchased seats
    status                text not null default 'active', -- active | past_due | cancelled
    allowed_domains       text[] default '{}',
    created_at            timestamptz default now()
);

create index if not exists idx_orgs_owner on organizations(owner_id);
create index if not exists idx_orgs_slug  on organizations(slug);

-- ── org_members ───────────────────────────────────────────────────────────────
create table if not exists org_members (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid references organizations(id) on delete cascade,
    user_id     text,                                -- Clerk user ID (null until accepted)
    email       text not null,
    role        text not null default 'member',      -- admin | member
    seat_tier   text not null default 'student',     -- student | pro
    status      text not null default 'pending',     -- pending | active | removed
    invited_at  timestamptz default now(),
    joined_at   timestamptz
);

create index if not exists idx_org_members_org    on org_members(org_id);
create index if not exists idx_org_members_user   on org_members(user_id);
create index if not exists idx_org_members_email  on org_members(email);

-- ── org_invites ───────────────────────────────────────────────────────────────
create table if not exists org_invites (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid references organizations(id) on delete cascade,
    token       text unique not null,
    email       text,                                -- null = open link
    max_uses    int,                                 -- null = unlimited
    uses        int not null default 0,
    seat_tier   text not null default 'student',     -- default tier for this invite
    expires_at  timestamptz,
    created_by  text not null,                       -- Clerk user ID
    created_at  timestamptz default now()
);

create index if not exists idx_org_invites_token  on org_invites(token);
create index if not exists idx_org_invites_org    on org_invites(org_id);

-- ── patch user_subscriptions ──────────────────────────────────────────────────
-- Add org_id column to track org-granted seats
alter table user_subscriptions
    add column if not exists org_id uuid references organizations(id) on delete set null;

create index if not exists idx_user_subs_org on user_subscriptions(org_id);
