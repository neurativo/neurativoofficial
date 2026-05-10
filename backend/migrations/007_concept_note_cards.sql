ALTER TABLE lectures
ADD COLUMN IF NOT EXISTS concept_note_cards
JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS
idx_lectures_concept_note_cards
ON lectures USING GIN (concept_note_cards)
WHERE concept_note_cards IS NOT NULL;
