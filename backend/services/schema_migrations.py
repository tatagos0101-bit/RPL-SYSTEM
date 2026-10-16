"""Additive schema upgrades compiled for the database's actual SQL dialect."""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, false, inspect, text
from sqlalchemy.schema import CreateColumn

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

    if conn.dialect.name != "postgresql":
        return
    # App users authenticate with FastAPI, not Supabase Auth. No browser/Data API
    # role may read passwords, government IDs, face embeddings, or other records.
    roles = set(conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).scalars())
    for table in metadata.sorted_tables:
        name = conn.dialect.identifier_preparer.quote(table.name)
        conn.execute(text(f"ALTER TABLE public.{name} ENABLE ROW LEVEL SECURITY"))
        if table.name == "auth_sessions":
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM PUBLIC"))
        for role in sorted(roles):
            conn.execute(text(f"REVOKE ALL ON TABLE public.{name} FROM {role}"))
