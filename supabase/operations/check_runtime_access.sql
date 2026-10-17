-- Read-only metadata checks; run connected as the proposed runtime LOGIN.
-- Does not select patron rows, credentials, or biometric contents.
BEGIN READ ONLY;
SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
       AS restricted_role_attributes,
       pg_has_role(current_user, 'rpl_app_runtime', 'USAGE') AS runtime_group_inherited,
       NOT has_schema_privilege(current_user, 'public', 'CREATE') AS cannot_create_public_objects,
       NOT has_database_privilege(current_user, current_database(), 'CREATE') AS cannot_create_schemas
FROM pg_roles WHERE rolname = current_user;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user) AS runtime_is_not_owner,
       has_table_privilege(current_user, c.oid, 'SELECT')
       AND has_table_privilege(current_user, c.oid, 'INSERT')
       AND has_table_privilege(current_user, c.oid, 'UPDATE')
       AND has_table_privilege(current_user, c.oid, 'DELETE') AS has_runtime_crud,
       NOT has_table_privilege(current_user, c.oid, 'TRUNCATE') AS cannot_truncate,
       NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_denied,
       NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_denied
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
    'users', 'auth_sessions', 'books', 'book_copies', 'book_interactions', 'transactions',
    'reservations', 'reservation_confirmations', 'notifications', 'entry_logs', 'reading_goals',
    'face_embeddings', 'password_reset_codes', 'security_alerts', 'library_settings'
)
ORDER BY c.relname;
ROLLBACK;
