-- Run after the appropriate prepare_runtime_role operation, as maintenance owner.
-- Creates a new DISABLED account, without a password. Never replaces an account.
-- Enable LOGIN only through the reviewed credential handoff/pooler acceptance.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(72851001);
DO $candidate$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rpl_api_runtime') THEN
        RAISE EXCEPTION 'Candidate already exists; inspect it instead of overwriting';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rpl_app_runtime'
                   AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
                            OR rolbypassrls OR rolreplication))
       OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
                   WHERE r.rolname='rpl_app_runtime') THEN
        RAISE EXCEPTION 'Restricted runtime group is missing or has unexpected attributes';
    END IF;
    CREATE ROLE rpl_api_runtime NOLOGIN INHERIT NOSUPERUSER NOCREATEDB
        NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD NULL;
    GRANT rpl_app_runtime TO rpl_api_runtime;
END
$candidate$;
COMMIT;
