-- ============================================================
-- 012_feature_flags.sql
-- Feature flags + What's New release announcements
-- ============================================================

-- Feature flags: control which users see unreleased/beta features
CREATE TABLE IF NOT EXISTS feature_flags (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key              TEXT        NOT NULL UNIQUE,        -- e.g. 'concept_map_v2'
    name             TEXT        NOT NULL,
    description      TEXT        NOT NULL DEFAULT '',
    enabled          BOOLEAN     NOT NULL DEFAULT FALSE,
    visibility       TEXT        NOT NULL DEFAULT 'internal'
                     CHECK (visibility IN ('internal', 'beta', 'public')),
    allowed_user_ids JSONB       NOT NULL DEFAULT '[]',  -- always-allowed user IDs
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What's New release cards (ChatGPT-style announcement modal)
CREATE TABLE IF NOT EXISTS feature_releases (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL,
    subtitle     TEXT        NOT NULL DEFAULT '',
    features     JSONB       NOT NULL DEFAULT '[]',
    -- each feature item: {icon, title, description, badge?: 'New'|'Improved'|'Beta'}
    cta_label    TEXT        NOT NULL DEFAULT 'Start exploring',
    cta_url      TEXT        NOT NULL DEFAULT '',
    target_plans TEXT[]      NOT NULL DEFAULT '{}',   -- empty = all plans
    published_at TIMESTAMPTZ,                          -- NULL = draft; set = live
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which users have already dismissed each release modal
CREATE TABLE IF NOT EXISTS release_dismissals (
    user_id      TEXT        NOT NULL,
    release_id   UUID        NOT NULL REFERENCES feature_releases(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS release_dismissals_user ON release_dismissals(user_id);
