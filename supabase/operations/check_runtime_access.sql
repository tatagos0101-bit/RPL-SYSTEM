-- Read-only metadata checks; run connected as the proposed runtime LOGIN.
-- Does not select patron rows, credentials, or biometric contents.
BEGIN READ ONLY;
SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
       AS restricted_role_attributes,
       current_user = session_user AS direct_runtime_login,
       pg_has_role(current_user, 'rpl_app_runtime', 'USAGE') AS runtime_group_inherited,
       NOT EXISTS (SELECT 1 FROM pg_roles other
                   WHERE other.rolname NOT IN (current_user, 'rpl_app_runtime')
                     AND pg_has_role(current_user, other.oid, 'MEMBER')) AS no_extra_role_memberships,
       NOT EXISTS (SELECT 1 FROM pg_auth_members membership
                   WHERE membership.member = (SELECT oid FROM pg_roles WHERE rolname=current_user)
                     AND membership.admin_option) AS cannot_delegate_roles,
       NOT EXISTS (SELECT 1 FROM pg_database database
                   WHERE pg_has_role(current_user, database.datdba, 'MEMBER')) AS owns_no_database,
       NOT EXISTS (SELECT 1 FROM pg_namespace schema
                   WHERE schema.nspname !~ '^pg_' AND schema.nspname <> 'information_schema'
                     AND pg_has_role(current_user, schema.nspowner, 'MEMBER')) AS owns_no_application_schema,
       16 = (SELECT count(*) FROM pg_class relation JOIN pg_namespace schema
             ON schema.oid=relation.relnamespace
             WHERE schema.nspname='public' AND relation.relkind IN ('r', 'p')
               AND relation.relname IN (
                 'users', 'auth_sessions', 'books', 'book_copies', 'book_interactions', 'transactions',
                 'reservations', 'reservation_confirmations', 'inventory_writes', 'notifications',
                 'entry_logs', 'reading_goals', 'face_embeddings', 'password_reset_codes',
                 'security_alerts', 'library_settings')) AS required_tables_present,
       NOT has_schema_privilege(current_user, 'public', 'CREATE') AS cannot_create_public_objects,
       NOT has_database_privilege(current_user, current_database(), 'CREATE') AS cannot_create_schemas
FROM pg_roles WHERE rolname = current_user;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       NOT pg_has_role(current_user, c.relowner, 'MEMBER') AS runtime_is_not_owner,
       row_security_active(c.oid) AS runtime_subject_to_rls,
       has_table_privilege(current_user, c.oid, 'SELECT')
       AND has_table_privilege(current_user, c.oid, 'INSERT')
       AND has_table_privilege(current_user, c.oid, 'UPDATE')
       AND has_table_privilege(current_user, c.oid, 'DELETE') AS has_runtime_crud,
       NOT has_table_privilege(current_user, c.oid, 'TRUNCATE,REFERENCES,TRIGGER') AS no_extra_table_privileges,
       NOT has_table_privilege(current_user, c.oid,
           'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION') AS cannot_delegate_table_access,
       NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_denied,
       NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_denied,
       CASE WHEN c.relname IN ('auth_sessions', 'library_settings', 'book_interactions', 'reservation_confirmations', 'inventory_writes')
            THEN true
            ELSE COALESCE(has_sequence_privilege(current_user,
                 pg_get_serial_sequence(format('public.%I', c.relname), 'id'), 'USAGE')
                 AND has_sequence_privilege(current_user,
                 pg_get_serial_sequence(format('public.%I', c.relname), 'id'), 'SELECT'), false)
       END AS required_sequence_access,
       CASE WHEN c.relname IN ('auth_sessions', 'library_settings', 'book_interactions', 'reservation_confirmations', 'inventory_writes')
            THEN true
            ELSE COALESCE(NOT has_sequence_privilege(current_user,
                 pg_get_serial_sequence(format('public.%I', c.relname), 'id'),
                 'UPDATE,USAGE WITH GRANT OPTION,SELECT WITH GRANT OPTION,UPDATE WITH GRANT OPTION'), false)
       END AS cannot_reset_or_delegate_sequence
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
    'users', 'auth_sessions', 'books', 'book_copies', 'book_interactions', 'transactions',
    'reservations', 'reservation_confirmations', 'inventory_writes', 'notifications', 'entry_logs', 'reading_goals',
    'face_embeddings', 'password_reset_codes', 'security_alerts', 'library_settings'
)
ORDER BY c.relname;
ROLLBACK;
