-- Read-only current-feature metadata. No member rows or secret values returned.
-- The historical baseline14/repair16 probes retain their versioned contracts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name='last_activity_at' AND data_type='timestamp with time zone'
) AS activity_column_ready;

SELECT relation.relrowsecurity AS notice_rls_enabled,
       has_table_privilege('rpl_app_runtime', relation.oid, 'SELECT')
       AND has_table_privilege('rpl_app_runtime', relation.oid, 'INSERT')
       AND has_table_privilege('rpl_app_runtime', relation.oid, 'UPDATE')
       AND has_table_privilege('rpl_app_runtime', relation.oid, 'DELETE') AS runtime_group_crud,
       NOT has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_denied,
       NOT has_table_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE') AS browser_role_denied,
       EXISTS (
           SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation.oid
             AND policy.polname='rpl_backend_access' AND policy.polcmd='*'
             AND policy.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='rpl_app_runtime')]
             AND pg_get_expr(policy.polqual, policy.polrelid)='true'
             AND pg_get_expr(policy.polwithcheck, policy.polrelid)='true'
       ) AS backend_policy_ready,
       EXISTS (
           SELECT 1 FROM pg_constraint constraint_row
           WHERE constraint_row.conrelid=relation.oid AND constraint_row.contype='f'
             AND constraint_row.confrelid=to_regclass('public.notifications')
             AND constraint_row.confdeltype='n'
       ) AS notification_delete_sets_null,
       EXISTS (
           SELECT 1 FROM pg_index index_row JOIN pg_class index_name ON index_name.oid=index_row.indexrelid
           WHERE index_row.indrelid=relation.oid AND index_name.relname='uq_account_deletion_notices_pending_member'
             AND index_row.indisunique AND index_row.indisvalid AND index_row.indpred IS NOT NULL
       ) AS pending_notice_uniqueness_ready
FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
WHERE namespace.nspname='public' AND relation.relname='account_deletion_notices';
ROLLBACK;
