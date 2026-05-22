-- ── Migration 011: User Feedback ──────────────────────────────────────────────
-- Stores in-app feedback from the floating widget and post-lecture rating prompt.
-- lecture_id is nullable — only set when feedback comes from the per-lecture prompt.
-- rating is nullable — only set from the star-rating prompt, not the general widget.

CREATE TABLE IF NOT EXISTS feedback (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    lecture_id  UUID        REFERENCES lectures(id) ON DELETE SET NULL,
    type        TEXT        NOT NULL DEFAULT 'general'
                            CHECK (type IN ('bug', 'feature', 'general')),
    message     TEXT        NOT NULL,
    rating      SMALLINT    CHECK (rating BETWEEN 1 AND 5),
    page_path   TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new', 'read', 'done')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_user_id    ON feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_status     ON feedback(status);
CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_lecture_id ON feedback(lecture_id) WHERE lecture_id IS NOT NULL;
