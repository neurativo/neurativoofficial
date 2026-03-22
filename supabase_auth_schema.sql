-- ============================================================
-- Neurativo: Complete Auth + Profile Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL editor)
-- Safe to re-run on an existing setup (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Profiles table — create with ALL required columns
CREATE TABLE IF NOT EXISTS public.profiles (
    id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                  TEXT,
    full_name              TEXT,
    display_name           TEXT,
    avatar_url             TEXT,
    preferred_language     TEXT DEFAULT 'en',
    pdf_auto_download      BOOLEAN DEFAULT TRUE,
    total_hours_recorded   FLOAT DEFAULT 0,
    total_words_transcribed INT DEFAULT 0,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if the table already existed without them
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name           TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language     TEXT DEFAULT 'en';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pdf_auto_download      BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_hours_recorded   FLOAT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_words_transcribed INT DEFAULT 0;

-- 2. Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Lectures table — add user_id column (safe to run on existing setups)
ALTER TABLE public.lectures
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lectures_user_id ON public.lectures(user_id);

-- 4. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for profiles
--    Drop first to avoid "already exists" errors on re-run
DROP POLICY IF EXISTS "Users can view their own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 6. RLS policies for lectures
--    The backend uses the service-role key which bypasses RLS.
--    These apply when accessing via anon/user key from the frontend.
DROP POLICY IF EXISTS "Users can view their own lectures"   ON public.lectures;
DROP POLICY IF EXISTS "Users can insert their own lectures" ON public.lectures;
DROP POLICY IF EXISTS "Users can update their own lectures" ON public.lectures;
DROP POLICY IF EXISTS "Users can delete their own lectures" ON public.lectures;

CREATE POLICY "Users can view their own lectures"
    ON public.lectures FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert their own lectures"
    ON public.lectures FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lectures"
    ON public.lectures FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lectures"
    ON public.lectures FOR DELETE
    USING (auth.uid() = user_id);
