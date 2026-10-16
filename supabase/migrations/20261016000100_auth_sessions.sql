-- Additive upgrade: apply with a migration role before deploying session-aware code.
-- No existing patron/loan/contact records are changed. Old stateless tokens must re-login.
BEGIN;
SELECT pg_advisory_xact_lock(72851001);
CREATE TABLE IF NOT EXISTS public.auth_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credential_digest VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_id ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires_at ON public.auth_sessions (expires_at);
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_sessions FROM PUBLIC, anon, authenticated;
COMMIT;
