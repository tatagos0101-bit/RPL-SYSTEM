from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL, ENVIRONMENT
from services.database_config import engine_settings

_url, _options = engine_settings(DATABASE_URL, production=ENVIRONMENT == "production")
engine = create_engine(_url, **_options)

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
    """Create/upgrade tables explicitly (production deploys run migrate.py first)."""
    # Import all models so Base knows about them before create_all
    from models import user, face_embedding, book, book_copy, transaction, reservation, entry_log, reading_goal, library_settings, notification, password_reset, security_alert  # noqa: F401
    from services.schema_migrations import upgrade_schema

    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(72851001)"))
        Base.metadata.create_all(bind=conn)
        upgrade_schema(conn, Base.metadata)
