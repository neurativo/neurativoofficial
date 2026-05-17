-- 010_study_tools.sql
-- Study Tools Suite: exam prep, concept map, summary embeddings, quiz attempt history

ALTER TABLE lectures ADD COLUMN IF NOT EXISTS exam_prep_questions JSONB;
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS concept_map        JSONB;
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS summary_embedding  JSONB;

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id       UUID        REFERENCES lectures(id) ON DELETE CASCADE,
    user_id          TEXT        NOT NULL,
    score            INT         NOT NULL,
    total            INT         NOT NULL,
    duration_seconds INT,
    answers_json     JSONB,
    weak_topics      JSONB,
    attempted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_lecture ON quiz_attempts(user_id, lecture_id);
