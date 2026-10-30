"""Apply additive schema upgrades and backfill existing records before release.

Usage: python migrate.py
DATABASE_URL must be set to the database that should be upgraded.
"""
from sqlalchemy import text
from database import init_db, SessionLocal


def run():
    print("Applying schema migrations...")
    init_db()
    from services.book_copy_service import ensure_book_copies
    from services.category_service import category_write_lock, reconcile_categories
    from services.face_engine_service import sync_legacy_face_embeddings

    with SessionLocal() as db:
        category_write_lock(db)
        category_changed = reconcile_categories(db)
        rows = db.execute(text("SELECT id FROM users WHERE member_id IS NULL")).scalars().all()
        for uid in rows:
            db.execute(text("UPDATE users SET member_id = :mid WHERE id = :uid"),
                       {"mid": f"RPL-{uid:05d}", "uid": uid})
        db.commit()
        changed = ensure_book_copies(db)
        face_changed = sync_legacy_face_embeddings(db)
        db.commit()
    print(f"Ready: {category_changed} category changes, {len(rows)} member IDs, {changed} copy changes, {face_changed} face embedding changes.")


if __name__ == "__main__":
    run()
