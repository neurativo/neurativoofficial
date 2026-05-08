-- Migration 006: Atomic starter credit grant
--
-- Moves the one-time starter grant into a single database function so the
-- ledger row and profiles.credits cannot diverge under concurrent requests.
-- Requires migration 005 so the partial unique index on starter_grant exists.

CREATE OR REPLACE FUNCTION grant_starter_credits(
    p_user_id text,
    p_email text,
    p_starter_credits integer DEFAULT 5
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id uuid;
    v_balance integer;
BEGIN
    IF COALESCE(TRIM(p_user_id), '') = '' OR COALESCE(TRIM(p_email), '') = '' THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.profiles (id, email, credits)
    VALUES (p_user_id, NULLIF(TRIM(p_email), ''), 0)
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email);

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, reason)
    VALUES (p_user_id, p_starter_credits, 0, 'starter_grant')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tx_id;

    IF v_tx_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + p_starter_credits,
        email = COALESCE(email, NULLIF(TRIM(p_email), ''))
    WHERE id = p_user_id
    RETURNING credits INTO v_balance;

    UPDATE public.credit_transactions
    SET balance_after = COALESCE(v_balance, p_starter_credits)
    WHERE id = v_tx_id;

    RETURN TRUE;
END;
$$;
