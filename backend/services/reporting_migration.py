"""Scoped, additive reporting upgrade. No inventory or historical data backfill."""
from sqlalchemy import inspect, text

# Verified on isolated PostgreSQL plans. Existing book/copy indexes are reused.
REPORTING_INDEXES = {
    'ix_reporting_visits_date': 'entry_logs (accessed_at) WHERE granted IS TRUE',
    'ix_reporting_visits_user_date': 'entry_logs (user_id, accessed_at) WHERE granted IS TRUE',
    'ix_reporting_borrow_date': 'transactions (borrow_date)',
    'ix_reporting_return_date': 'transactions (return_date) WHERE return_date IS NOT NULL',
}


def upgrade_reporting_schema(conn):
    from models import user, book, book_copy, copy_acquisition  # noqa: F401
    required = {'users', 'books', 'book_copies', 'transactions', 'entry_logs'}
    if not required.issubset(inspect(conn).get_table_names()):
        raise RuntimeError('Apply the existing application schema before the reporting upgrade.')
    copy_acquisition.CopyAcquisition.__table__.create(conn, checkfirst=True)
    if conn.dialect.name != 'postgresql':
        return
    for name, definition in REPORTING_INDEXES.items():
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS {name} ON {definition}'))
    conn.execute(text('ALTER TABLE public.copy_acquisitions ENABLE ROW LEVEL SECURITY'))
    conn.execute(text('REVOKE ALL ON TABLE public.copy_acquisitions FROM PUBLIC'))
    roles = set(conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','rpl_app_runtime')")).scalars())
    for role in sorted(roles & {'anon', 'authenticated'}):
        conn.execute(text(f'REVOKE ALL ON TABLE public.copy_acquisitions FROM {role}'))
    if 'rpl_app_runtime' in roles:
        conn.execute(text('GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_acquisitions TO rpl_app_runtime'))
        policy = conn.execute(text("SELECT roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='copy_acquisitions' AND policyname='rpl_reporting_runtime'")).first()
        if policy and (list(policy.roles) != ['rpl_app_runtime'] or policy.cmd != 'ALL' or policy.qual != 'true' or policy.with_check != 'true'):
            raise RuntimeError('Existing acquisition runtime policy differs; review before upgrading.')
        if not policy:
            conn.execute(text('CREATE POLICY rpl_reporting_runtime ON public.copy_acquisitions TO rpl_app_runtime USING (true) WITH CHECK (true)'))
