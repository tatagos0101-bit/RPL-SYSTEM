"""Atomic, owner-scoped feedback updates; never retain a raw click stream."""
from sqlalchemy import case, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from models.book_interaction import BookInteraction
from timezone_utils import now_ph


def update_interaction(db, user_id: int, book_id: int, *, favorite=None, viewed=False):
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    changes = {"is_favorite": favorite} if favorite is not None else {}
    if viewed:
        changes["viewed_at"] = now_ph()
    statement = insert(BookInteraction).values(user_id=user_id, book_id=book_id, **changes)
    if viewed:
        changes["viewed_at"] = case((or_(BookInteraction.viewed_at.is_(None),
                                        BookInteraction.viewed_at < changes["viewed_at"]),
                                       changes["viewed_at"]), else_=BookInteraction.viewed_at)
    # Updating only the submitted fields preserves concurrent views/favorites.
    db.execute(statement.on_conflict_do_update(
        index_elements=["user_id", "book_id"], set_=changes,
    ))
    db.commit()
