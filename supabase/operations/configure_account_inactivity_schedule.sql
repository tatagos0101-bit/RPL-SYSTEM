-- Run only after the additive schema and API/frontend checks.
-- Prepare an INACTIVE hourly job; enable only after its protected dry-run.
-- Direct HTTPS keeps the purpose credential out of pg_net's shared queue.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

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

REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
REVOKE ALL ON vault.secrets FROM PUBLIC, anon, authenticated, rpl_app_runtime, rpl_api_runtime;
DO $privacy$
BEGIN
    IF EXISTS (
        SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('rpl_app_runtime'), ('rpl_api_runtime')) r(name)
        WHERE has_table_privilege(r.name, 'vault.decrypted_secrets', 'SELECT')
           OR has_table_privilege(r.name, 'vault.secrets', 'SELECT')
    ) THEN RAISE EXCEPTION 'Vault must be private before preparing this job'; END IF;
END
$privacy$;

SELECT cron.schedule(
    'rpl-account-inactivity-hourly',
    '17 * * * *',
    $job$
    DO $check$
    DECLARE response_status integer;
    BEGIN
        PERFORM set_config('statement_timeout', '70s', true);
        PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '60000');
        PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '10000');
        SELECT result.status INTO response_status
        FROM extensions.http((
            'POST',
            'https://rpl-system-api.vercel.app/api/internal/account-inactivity/check',
            ARRAY[ROW('Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets
                WHERE name='rpl_account_inactivity_job_key'
            ))::extensions.http_header],
            'application/json',
            '{}'
        )::extensions.http_request) AS result;
        IF response_status IS DISTINCT FROM 200 THEN
            RAISE EXCEPTION 'Account notice check returned HTTP %', response_status;
        END IF;
    END
    $check$;
    $job$
);
SELECT cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname='rpl-account-inactivity-hourly'),
    active := false
);
COMMIT;

-- Run the same command first with body '{"dry_run":true}', keeping all real
-- processing disabled. A successful Cron run proves HTTP 200 because the block
-- raises on every other status. Inspect status/times only, never headers/bodies.
-- Then restore body '{}', schedule '17 * * * *', and activate this job.
