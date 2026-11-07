-- Additive OTP upgrade. Execute in one authorized transaction before new API code.
-- Old codes intentionally remain unusable: context_hash/delivered_at are NULL.
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE public.password_reset_codes ADD COLUMN IF NOT EXISTS purpose varchar(20) NOT NULL DEFAULT 'reset';
ALTER TABLE public.password_reset_codes ADD COLUMN IF NOT EXISTS context_hash varchar(128);
ALTER TABLE public.password_reset_codes ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.password_reset_codes ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_codes FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.password_reset_codes FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.password_reset_codes FROM authenticated;
  END IF;
END $$;
