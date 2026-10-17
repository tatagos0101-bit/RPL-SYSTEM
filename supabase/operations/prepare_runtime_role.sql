-- REVIEW ONLY until explicitly authorized. Run as the migration owner on an
-- isolated PostgreSQL target first. Requires all 15 application tables.
-- Creates no login/password and changes no existing connection credential.
BEGIN;
SELECT pg_advisory_xact_lock(72851001);
DO $setup$
DECLARE
    table_name text;
    sequence_name text;
    runtime_oid oid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rpl_app_runtime') THEN
        CREATE ROLE rpl_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
    END IF;
    SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname = 'rpl_app_runtime';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE oid = runtime_oid
               AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication))
       OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = runtime_oid) THEN
        RAISE EXCEPTION 'Runtime group has unexpected privileges or memberships; review manually';
    END IF;
    GRANT USAGE ON SCHEMA public TO rpl_app_runtime;
    FOREACH table_name IN ARRAY ARRAY[
        'users', 'auth_sessions', 'books', 'book_copies', 'book_interactions', 'transactions',
        'reservations', 'reservation_confirmations', 'notifications', 'entry_logs', 'reading_goals',
        'face_embeddings', 'password_reset_codes', 'security_alerts', 'library_settings'
    ] LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN
            RAISE EXCEPTION 'Required application table is missing; apply schema upgrade first';
        END IF;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO rpl_app_runtime', table_name);
        IF NOT EXISTS (SELECT 1 FROM pg_policy
                       WHERE polrelid = to_regclass(format('public.%I', table_name))
                         AND polname = 'rpl_backend_access') THEN
            EXECUTE format('CREATE POLICY rpl_backend_access ON public.%I FOR ALL TO rpl_app_runtime USING (true) WITH CHECK (true)', table_name);
        ELSIF NOT EXISTS (SELECT 1 FROM pg_policy
                          WHERE polrelid = to_regclass(format('public.%I', table_name))
                            AND polname = 'rpl_backend_access' AND polcmd = '*' AND polpermissive
                            AND polroles = ARRAY[runtime_oid]
                            AND pg_get_expr(polqual, polrelid) = 'true'
                            AND pg_get_expr(polwithcheck, polrelid) = 'true') THEN
            RAISE EXCEPTION 'Existing runtime policy differs from expected policy; review manually';
        END IF;
        IF table_name NOT IN ('library_settings', 'book_interactions', 'reservation_confirmations') THEN
            sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
            IF sequence_name IS NOT NULL THEN
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO rpl_app_runtime', sequence_name);
            END IF;
        END IF;
    END LOOP;
END
$setup$;
-- FastAPI still owns member/librarian/owner authorization. Never grant this group
-- to anon, authenticated, authenticator, or any browser-accessible identity.
-- Create a separate, non-owner LOGIN securely and grant ONLY this group to it.
COMMIT;
