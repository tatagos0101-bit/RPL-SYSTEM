from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL

_connect_args = {}
if DATABASE_URL.startswith("mysql"):
    _connect_args["ssl"] = {"verify_cert": False, "verify_identity": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,              # set True to see raw SQL in terminal
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called once on startup."""
    # Import all models so Base knows about them before create_all
    from models import user, face_embedding, book, book_copy, transaction, reservation, entry_log, reading_goal, library_settings, notification, password_reset  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Add new columns to existing tables without dropping data.
    _add_column_if_missing("entry_logs",    "time_out",     "DATETIME")
    _add_column_if_missing("notifications", "user_id",      "INT")
    _add_column_if_missing("users",         "id_image_url", "VARCHAR(300)")
    _add_column_if_missing("users",         "avatar_url",   "VARCHAR(300)")
    _add_column_if_missing("users",         "must_change_password", "BOOLEAN DEFAULT 0")
    _add_column_if_missing("users",         "email_verified", "BOOLEAN DEFAULT 0")
    _add_column_if_missing("users",         "phone_verified", "BOOLEAN DEFAULT 0")
    _add_column_if_missing("transactions",  "copy_id", "INT NULL")


def _add_column_if_missing(table: str, column: str, col_type: str) -> None:
    """Run ALTER TABLE … ADD COLUMN only when the column doesn't exist yet."""
    with engine.connect() as conn:
        insp = inspect(engine)
        existing = [c["name"] for c in insp.get_columns(table)]

        if column not in existing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
