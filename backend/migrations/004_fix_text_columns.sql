-- Fix column types to TEXT for Clerk user ID compatibility
-- Clerk user IDs (user_xxx) are not valid UUIDs.
-- If these columns were created as UUID (e.g. from a Supabase template),
-- they must be TEXT to store Clerk IDs.
-- Safe to run: converts existing UUID-format values to their text representation.

ALTER TABLE credit_transactions
    ALTER COLUMN user_id TYPE TEXT;

ALTER TABLE profiles
    ALTER COLUMN id TYPE TEXT;

-- Verify
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('profiles', 'credit_transactions')
  AND column_name IN ('id', 'user_id')
ORDER BY table_name, column_name;
