-- Metadata only. Run using the application's configured database connection.
-- No application rows, passwords, role names, function bodies or object values.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SELECT current_setting('transaction_read_only') = 'on' AS read_only_transaction,
       current_user = session_user AS direct_login,
       role.rolcanlogin AS login_allowed,
       role.rolsuper AS superuser,
       role.rolcreatedb AS can_create_database,
       role.rolcreaterole AS can_create_role,
       role.rolbypassrls AS bypasses_rls,
       role.rolreplication AS replication,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rpl_app_runtime') AS runtime_group_exists,
       COALESCE((SELECT pg_has_role(current_user, oid, 'USAGE') FROM pg_roles
                 WHERE rolname='rpl_app_runtime'), false) AS runtime_group_inherited,
       has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_objects,
       has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schemas,
       (SELECT count(*) FROM pg_roles other
        WHERE other.rolname NOT IN (current_user, 'rpl_app_runtime')
          AND pg_has_role(current_user, other.oid, 'MEMBER')) AS extra_role_membership_count,
       (SELECT count(*) FROM pg_auth_members membership WHERE membership.admin_option
        AND membership.member = role.oid) AS delegable_role_membership_count,
       (SELECT count(*) FROM pg_database database
        WHERE pg_has_role(current_user, database.datdba, 'MEMBER')) AS owned_database_count,
       (SELECT count(*) FROM pg_namespace schema
        WHERE schema.nspname !~ '^pg_' AND schema.nspname <> 'information_schema'
          AND pg_has_role(current_user, schema.nspowner, 'MEMBER')) AS owned_application_schema_count,
       (SELECT count(*) FROM pg_proc routine JOIN pg_namespace schema ON schema.oid=routine.pronamespace
        WHERE schema.nspname='public' AND routine.prosecdef
          AND has_function_privilege(current_user, routine.oid, 'EXECUTE')) AS executable_public_definer_function_count
FROM pg_roles role WHERE role.rolname=current_user;

WITH expected(table_name) AS (VALUES
    ('users'), ('auth_sessions'), ('books'), ('book_copies'), ('book_interactions'),
    ('transactions'), ('reservations'), ('reservation_confirmations'), ('inventory_writes'),
    ('notifications'), ('entry_logs'), ('reading_goals'), ('face_embeddings'),
    ('password_reset_codes'), ('security_alerts'), ('library_settings')
), access AS (
    SELECT expected.table_name, relation.oid, relation.relowner, relation.relrowsecurity
    FROM expected LEFT JOIN pg_namespace schema ON schema.nspname='public'
    LEFT JOIN pg_class relation ON relation.relnamespace=schema.oid
         AND relation.relname=expected.table_name AND relation.relkind IN ('r', 'p')
)
SELECT count(*) FILTER (WHERE oid IS NOT NULL) AS present_application_table_count,
       count(*) FILTER (WHERE oid IS NULL) AS missing_application_table_count,
       count(*) FILTER (WHERE oid IS NULL AND table_name NOT IN
           ('reservation_confirmations', 'inventory_writes')) AS missing_live_baseline_table_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND NOT relrowsecurity) AS tables_without_rls_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND pg_has_role(current_user, relowner, 'MEMBER')) AS owned_application_table_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND row_security_active(oid)) AS tables_enforcing_runtime_rls_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND has_table_privilege(current_user, oid,
           'TRUNCATE,REFERENCES,TRIGGER')) AS tables_with_extra_privileges_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND has_table_privilege(current_user, oid,
           'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')) AS delegable_table_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND has_table_privilege('anon', oid,
           'SELECT,INSERT,UPDATE,DELETE')) AS anonymous_accessible_table_count,
       count(*) FILTER (WHERE oid IS NOT NULL AND has_table_privilege('authenticated', oid,
           'SELECT,INSERT,UPDATE,DELETE')) AS browser_accessible_table_count
FROM access;
ROLLBACK;
