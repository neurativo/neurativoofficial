-- =============================================================================
-- 009_visit_analytics.sql  —  Page visit tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS page_visits (
    id          BIGSERIAL   PRIMARY KEY,
    page        TEXT        NOT NULL,        -- e.g. 'landing', 'app', 'lecture', 'share'
    session_id  TEXT,                        -- client UUID (sessionStorage), links visits in a session
    user_id     TEXT,                        -- null = unauthenticated visitor
    referrer    TEXT,                        -- document.referrer, trimmed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_visits_created_at_idx ON page_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS page_visits_page_idx       ON page_visits(page);
CREATE INDEX IF NOT EXISTS page_visits_user_id_idx    ON page_visits(user_id) WHERE user_id IS NOT NULL;
