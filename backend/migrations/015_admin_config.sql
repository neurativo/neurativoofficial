-- ============================================================
-- 015_admin_config.sql
-- Key-value store for admin overrides (e.g. plan_limits).
-- Referenced by supabase_service.get_plan_limits_override /
-- set_plan_limits_override and core/plans.get_limits.
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_config (
    key        TEXT        PRIMARY KEY,
    value      JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
