-- =============================================================================
-- 014_admin_users.sql  —  DB-managed admin user list
-- =============================================================================
-- Extends the env-var ADMIN_USER_IDS allowlist with DB-managed entries.
-- Env-var admins (superadmins) are always active regardless of this table.
-- This table allows adding/removing admins from the UI without redeploying.

CREATE TABLE IF NOT EXISTS admin_users (
    user_id    TEXT        PRIMARY KEY,   -- Clerk user ID (user_xxx)
    added_by   TEXT        NOT NULL,      -- Clerk user ID of who added them
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
