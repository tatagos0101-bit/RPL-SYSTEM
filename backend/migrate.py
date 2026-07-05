"""
migrate.py — Safe schema migration for Rizal Provincial Library.

Adds columns that were introduced after the initial database creation.
Safe to run multiple times — skips columns that already exist.

Usage:
    python migrate.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from sqlalchemy import inspect as sa_inspect
from database import engine, SessionLocal


def table_exists(table: str) -> bool:
    insp = sa_inspect(engine)
    return table in insp.get_table_names()


def column_exists(table: str, column: str) -> bool:
    insp = sa_inspect(engine)
    return column in {c["name"] for c in insp.get_columns(table)}


MIGRATIONS = [
    # (table, column, definition)
    ("users", "member_id",    "VARCHAR(20) NULL"),
    ("users", "id_image_url", "VARCHAR(300) NULL"),
    ("users", "avatar_url",   "VARCHAR(300) NULL"),
    ("users", "must_change_password", "BOOLEAN DEFAULT 0"),
    ("users", "email_verified", "BOOLEAN DEFAULT 0"),
    ("users", "phone_verified", "BOOLEAN DEFAULT 0"),
    ("transactions", "copy_id", "INT NULL"),
]


def run():
    print("Running migrations...")
    from models import (  # noqa: F401
        book,
        book_copy,
        entry_log,
        face_embedding,
        library_settings,
        notification,
        password_reset,
        reading_goal,
        reservation,
        security_alert,
        transaction,
        user,
    )

    if table_exists("book_copies"):
        print("  SKIP  book_copies (already exists)")
    else:
        book_copy.BookCopy.__table__.create(bind=engine, checkfirst=True)
        print("  ADDED book_copies")

    if table_exists("face_embeddings"):
        print("  SKIP  face_embeddings (already exists)")
    else:
        face_embedding.FaceEmbedding.__table__.create(bind=engine, checkfirst=True)
        print("  ADDED face_embeddings")

    with engine.connect() as conn:
        for table, col, definition in MIGRATIONS:
            if column_exists(table, col):
                print(f"  SKIP  {table}.{col} (already exists)")
            else:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                conn.commit()
                print(f"  ADDED {table}.{col}")

    # Auto-generate member_id for any rows that are still NULL
    db = SessionLocal()
    try:
        rows = db.execute(text("SELECT id FROM users WHERE member_id IS NULL")).fetchall()
        for (uid,) in rows:
            mid = f"RPL-{uid:05d}"
            db.execute(text("UPDATE users SET member_id = :mid WHERE id = :uid"), {"mid": mid, "uid": uid})
            print(f"  SET   users.id={uid} member_id={mid}")
        db.commit()

        from services.book_copy_service import ensure_book_copies
        from services.face_engine_service import sync_legacy_face_embeddings

        changed = ensure_book_copies(db)
        print(f"  SYNC  book copy QR rows ({changed} change(s))")
        face_changed = sync_legacy_face_embeddings(db)
        db.commit()
        print(f"  SYNC  legacy face embeddings ({face_changed} change(s))")
    finally:
        db.close()

    print("Done.")


if __name__ == "__main__":
    run()
