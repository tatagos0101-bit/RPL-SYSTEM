"""Additive schema upgrades compiled for the database's actual SQL dialect."""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, false, inspect, text
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
    "entry_logs": [("time_out", DateTime(timezone=True), None)],
    "notifications": [("user_id", Integer, None)],
    "users": [
        ("member_id", String(20), None),
        ("id_image_url", String(300), None),
        ("avatar_url", String(300), None),
        ("must_change_password", Boolean, false()),
        ("email_verified", Boolean, false()),
        ("phone_verified", Boolean, false()),
    ],
    "transactions": [("copy_id", Integer, None)],
}


def upgrade_schema(conn, metadata) -> None:
    for table_name, columns in ADDITIONS.items():
        existing = {c["name"] for c in inspect(conn).get_columns(table_name)}
        for name, column_type, default in columns:
            if name not in existing:
                column = Column(name, column_type, server_default=default)
                definition = str(CreateColumn(column).compile(dialect=conn.dialect))
                table = conn.dialect.identifier_preparer.quote(table_name)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {definition}"))

    # create_all does not add indexes to tables that already exist.
    for table_name, index_name in (
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
    for name in ('message', 'member_name', 'book_title'):
        conn.execute(text(f'ALTER TABLE notifications ALTER COLUMN {name} TYPE TEXT'))
    # App users authenticate with FastAPI, not Supabase Auth. No browser/Data API
    # role may read passwords, government IDs, face embeddings, or other records.
    roles = set(conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).scalars())
    for table in metadata.sorted_tables:
        name = conn.dialect.identifier_preparer.quote(table.name)
        conn.execute(text(f"ALTER TABLE public.{name} ENABLE ROW LEVEL SECURITY"))
        if table.name in ("auth_sessions", "reservation_confirmations"):
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM PUBLIC"))
        for role in sorted(roles):
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM {role}"))
