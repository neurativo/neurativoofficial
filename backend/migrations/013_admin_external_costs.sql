-- =============================================================================
-- 013_admin_external_costs.sql  —  Manual infrastructure cost entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_external_costs (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    category    TEXT            NOT NULL,
    label       TEXT            NOT NULL,
    amount_usd  NUMERIC(10,2)   NOT NULL,
    period      TEXT            NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_external_costs_period
    ON admin_external_costs(period);
