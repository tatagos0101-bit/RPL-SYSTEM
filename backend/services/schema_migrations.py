"""Additive schema upgrades compiled for the database's actual SQL dialect."""
from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, false, true, inspect, text
from sqlalchemy.schema import CreateColumn


def repair_preflight(conn):
    """Refuse ambiguous upgrades. Report counts only, never patron identities."""
    tables = set(inspect(conn).get_table_names())
    problems = []
    if 'users' in tables:
        collisions = conn.execute(text("SELECT count(*) FROM (SELECT lower(trim(email)) FROM users WHERE email IS NOT NULL GROUP BY lower(trim(email)) HAVING count(*) > 1) AS collisions")).scalar()
        if collisions:
            problems.append(f'{collisions} conflicting email groups; resolve account identities explicitly')
    if {'reservations', 'books'}.issubset(tables):
        duplicates = conn.execute(text("SELECT count(*) FROM (SELECT user_id, book_id FROM reservations WHERE status IN ('pending','ready') GROUP BY user_id, book_id HAVING count(*) > 1) AS duplicates")).scalar()
        if duplicates:
            problems.append(f'{duplicates} duplicate active member/title reservations; review and cancel duplicates explicitly')
        from timezone_utils import now_ph
        holds = conn.execute(text("SELECT count(*) FROM (SELECT r.book_id FROM reservations r JOIN books b ON b.id=r.book_id WHERE r.status='ready' AND (r.expires_at IS NULL OR r.expires_at > :now) GROUP BY r.book_id, b.copies_available HAVING count(*) > b.copies_available) AS holds"), {'now': now_ph()}).scalar()
        if holds:
            problems.append(f'{holds} titles with overcommitted ready holds; reconcile pickup promises and stock explicitly')
    if problems:
        raise RuntimeError('Repair migration aborted: ' + '; '.join(problems) + '. No records were rewritten.')

ADDITIONS = {
    "password_reset_codes": [
        ("purpose", String(20), text("'reset'")),
        ("context_hash", String(128), None),
        ("attempts", Integer, text("0")),
        ("delivered_at", DateTime(timezone=True), None),
    ],
    "books": [("category_override", String(80), None), ("raw_api_label", String(1000), None), ("is_hidden", Boolean, true()), ("description", Text, None),
              ("is_borrowable", Boolean, true()), ("circulation_note", String(500), None)],
    "book_copies": [("condition", String(20), None)],
    "entry_logs": [
        ("time_out", DateTime(timezone=True), None),
        ("visitor_name", String(150), None),
        ("visitor_location", String(200), None),
        ("manual_request_id", String(36), None),
    ],
    "notifications": [("user_id", Integer, None)],
    "users": [
        ("is_blacklisted", Boolean, false()),
        ("last_activity_at", DateTime(timezone=True), None),
        ("deleted_at", DateTime(timezone=True), None),
        ("member_id", String(20), None),
        ("id_image_url", String(300), None),
        ("id_document_digest", String(64), None),
        ("id_document_type", String(40), None),
        ("id_verified_at", DateTime(timezone=True), None),
        ("id_verified_by_id", Integer, None),
        ("face_id_verified_at", DateTime(timezone=True), None),
        ("avatar_url", String(300), None),
        ("generated_location", String(120), None),
        ("must_change_password", Boolean, false()),
        ("temporary_password_expires_at", DateTime(timezone=True), None),
        ("privacy_consent_pending", Boolean, false()),
        ("privacy_policy_version", String(32), None),
        ("privacy_policy_accepted_at", DateTime(timezone=True), None),
        ("face_consent_version", String(32), None),
        ("face_consent_at", DateTime(timezone=True), None),
        ("face_consent_method", String(24), None),
        ("face_consent_recorded_by_id", Integer, None),
        ("face_enrollment_display_only", Boolean, false()),
        ("email_verified", Boolean, false()),
        ("phone_verified", Boolean, false()),
    ],
    "transactions": [("copy_id", Integer, None), ("late_fee", Numeric(8, 2), None),
        ("condition_fee", Numeric(8, 2), text("0")), ("return_condition", String(20), None),
        ("inspection_reason", String(40), None), ("inspection_notes", String(1000), None),
        ("inspected_by_id", Integer, None), ("inspected_at", DateTime(timezone=True), None)],
}


def upgrade_schema(conn, metadata) -> None:
    user_columns = {column["name"] for column in inspect(conn).get_columns("users")}
    legacy_temporary_passwords = "temporary_password_expires_at" not in user_columns
    legacy_privacy_setup = "privacy_consent_pending" not in user_columns
    for table_name, columns in ADDITIONS.items():
        existing = {c["name"] for c in inspect(conn).get_columns(table_name)}
        for name, column_type, default in columns:
            if name not in existing:
                column = Column(name, column_type, nullable=name not in {"privacy_consent_pending", "is_borrowable", "is_blacklisted", "condition_fee"}, server_default=default)
                definition = str(CreateColumn(column).compile(dialect=conn.dialect))
                table = conn.dialect.identifier_preparer.quote(table_name)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {definition}"))

    if legacy_temporary_passwords:
        from services.credential_expiry import temporary_password_deadline
        # Old issue times were not recorded. One rollout window, never renewed.
        conn.execute(text("UPDATE users SET temporary_password_expires_at = :deadline WHERE must_change_password = true AND deleted_at IS NULL"), {"deadline": temporary_password_deadline()})

    if legacy_privacy_setup:
        # Initial registration inserts the temporary credential; password resets update the user.
        conn.execute(text("""
            UPDATE users SET privacy_consent_pending = true
            WHERE role = 'member' AND must_change_password = true AND deleted_at IS NULL
                AND temporary_password_expires_at IS NOT NULL AND updated_at IS NULL
        """))

    # create_all does not add indexes to tables that already exist.
    for table_name, index_name in (
        ("users", "uq_users_id_document_digest"),
        ("account_deletion_notices", "uq_account_deletion_notices_pending_member"),
        ("account_deletion_notices", "ix_account_deletion_notices_status_deadline"),
        ("account_deletion_notices", "ix_account_deletion_notices_notification_id"),
        ("account_deletion_notices", "ix_account_deletion_notices_member_created"),
        ("entry_logs", "uq_entry_logs_manual_request_id"),
        ("transactions", "ix_transactions_recommendation_history"),
        ("reservations", "ix_reservations_member_status_book"),
        ("reservations", "uq_reservations_active_member_book"),
        ("reservations", "ix_reservations_book_queue"),
    ):
        for index in metadata.tables[table_name].indexes:
            if index.name == index_name:
                index.create(bind=conn, checkfirst=True)

    conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_normalized_email ON users (lower(trim(email))) WHERE email IS NOT NULL'))
    if conn.dialect.name != "postgresql":
        return
    if not any(fk["constrained_columns"] == ["inspected_by_id"] for fk in inspect(conn).get_foreign_keys("transactions")):
        conn.execute(text('ALTER TABLE transactions ADD CONSTRAINT transactions_inspected_by_id_fkey FOREIGN KEY (inspected_by_id) REFERENCES users(id)'))
    for name in ('message', 'member_name', 'book_title'):
        conn.execute(text(f'ALTER TABLE notifications ALTER COLUMN {name} TYPE TEXT'))
    # App users authenticate with FastAPI, not Supabase Auth. No browser/Data API
    # role may read passwords, government IDs, face embeddings, or other records.
    roles = set(conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).scalars())
    for table in metadata.sorted_tables:
        name = conn.dialect.identifier_preparer.quote(table.name)
        conn.execute(text(f"ALTER TABLE public.{name} ENABLE ROW LEVEL SECURITY"))
        if table.name in ("account_deletion_notices", "auth_sessions", "password_reset_codes", "reservation_confirmations", "inventory_writes", "copy_acquisitions", "member_account_actions", "member_applications"):
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM PUBLIC"))
        for role in sorted(roles):
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM {role}"))

    from services.reporting_migration import upgrade_reporting_schema
    upgrade_reporting_schema(conn)
    upgrade_workflow_security(conn)


def upgrade_workflow_security(conn):
    """Only the trusted FastAPI runtime role may access workflow records."""
    if conn.dialect.name != "postgresql":
        return
    roles = set(conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','rpl_app_runtime')")).scalars())
    for table in ("member_applications", "member_account_actions"):
        conn.execute(text(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY'))
        conn.execute(text(f'REVOKE ALL ON TABLE public.{table} FROM PUBLIC'))
        sequence = f"public.{table}_id_seq"
        conn.execute(text(f'REVOKE ALL ON SEQUENCE {sequence} FROM PUBLIC'))
        for role in sorted(roles & {"anon", "authenticated"}):
            conn.execute(text(f'REVOKE ALL ON TABLE public.{table} FROM {role}'))
            conn.execute(text(f'REVOKE ALL ON SEQUENCE {sequence} FROM {role}'))
        if "rpl_app_runtime" in roles:
            conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO rpl_app_runtime'))
            conn.execute(text(f'GRANT USAGE, SELECT ON SEQUENCE {sequence} TO rpl_app_runtime'))
            policy = conn.execute(text("SELECT roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=:table AND policyname='rpl_workflow_runtime'"), {"table": table}).first()
            if policy and (list(policy.roles) != ["rpl_app_runtime"] or policy.cmd != "ALL" or policy.qual != "true" or policy.with_check != "true"):
                raise RuntimeError("Existing workflow runtime policy differs; review before upgrading.")
            if not policy:
                conn.execute(text(f'CREATE POLICY rpl_workflow_runtime ON public.{table} TO rpl_app_runtime USING (true) WITH CHECK (true)'))
