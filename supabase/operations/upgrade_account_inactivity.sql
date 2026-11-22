-- Scoped additive feature upgrade. Preserve production AUTO_MIGRATE=false.
-- No account records, contacts, files or historical rows are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(72851001);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS account_deletion_notices (
	id VARCHAR(36) NOT NULL,
	user_id INTEGER NOT NULL,
	notification_id INTEGER,
	last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	respond_by TIMESTAMP WITH TIME ZONE NOT NULL,
	status VARCHAR(16) NOT NULL,
	delivery_channel VARCHAR(8) NOT NULL,
	delivery_status VARCHAR(12) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id),
	FOREIGN KEY(notification_id) REFERENCES notifications (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_account_deletion_notices_member_created ON account_deletion_notices (user_id, created_at);

CREATE INDEX IF NOT EXISTS ix_account_deletion_notices_notification_id ON account_deletion_notices (notification_id);

CREATE INDEX IF NOT EXISTS ix_account_deletion_notices_status_deadline ON account_deletion_notices (status, respond_by);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_notices_pending_member ON account_deletion_notices (user_id) WHERE status = 'pending';

ALTER TABLE public.account_deletion_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_deletion_notices TO rpl_app_runtime;
DO $policy$
DECLARE runtime_oid oid;
BEGIN
    SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname='rpl_app_runtime';
    IF runtime_oid IS NULL THEN RAISE EXCEPTION 'Prepare the restricted runtime group before this feature'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.account_deletion_notices'::regclass AND polname='rpl_backend_access') THEN
        CREATE POLICY rpl_backend_access ON public.account_deletion_notices FOR ALL TO rpl_app_runtime USING (true) WITH CHECK (true);
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polrelid='public.account_deletion_notices'::regclass
          AND polname='rpl_backend_access' AND polcmd='*' AND polpermissive
          AND polroles=ARRAY[runtime_oid]
          AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true'
    ) THEN RAISE EXCEPTION 'Existing notice runtime policy differs; review before changing access'; END IF;
END
$policy$;
COMMIT;
