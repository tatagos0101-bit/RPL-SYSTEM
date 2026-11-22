-- Authorized feature setup ONLY AFTER schema/API/frontend verification.
-- The job stays INACTIVE until an authenticated dry-run has succeeded.
-- Generates a purpose-only key inside Vault; never selects its plaintext/digest.
-- This hourly job sends notices/reconciles activity. It cannot delete accounts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $setup$
DECLARE
    job_key text;
BEGIN
    SELECT decrypted_secret INTO job_key FROM vault.decrypted_secrets
    WHERE name='rpl_account_inactivity_job_key';
    IF job_key IS NULL THEN
        job_key := encode(extensions.gen_random_bytes(32), 'hex');
        PERFORM vault.create_secret(job_key, 'rpl_account_inactivity_job_key',
            'Purpose-only account notice scheduler credential; never a login or database credential');
    END IF;
    INSERT INTO public.library_settings(key, value)
    VALUES ('account_inactivity_job_digest', encode(extensions.digest(job_key, 'sha256'), 'hex'))
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
END
$setup$;

-- pg_net holds HTTP headers in its transient queue. Keep it server-only.
REVOKE ALL ON SCHEMA net FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
REVOKE ALL ON vault.secrets FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;

SELECT cron.schedule(
    'rpl-account-inactivity-hourly',
    '17 * * * *',
    $job$
    SELECT net.http_post(
        url := 'https://rpl-system-api.vercel.app/api/internal/account-inactivity/check',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets
                WHERE name='rpl_account_inactivity_job_key'
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $job$
);
SELECT cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname='rpl-account-inactivity-hourly'),
    active := false
);
COMMIT;

-- Verify only cron job metadata and HTTP status/timeout. A queued request ID
-- does not prove successful API execution. Do not print request headers/bodies.
-- After a protected HTTP dry-run returns 200 without timeout, activate explicitly:
-- SELECT cron.alter_job((SELECT jobid FROM cron.job
--     WHERE jobname='rpl-account-inactivity-hourly'), active := true);
