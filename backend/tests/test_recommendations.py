"""Synthetic feedback only: no patron records, real clicks, or library exports."""
from datetime import timedelta

import pytest
from sqlalchemy import event, inspect

from database import Base
from models.book import Book
from models.book_interaction import BookInteraction
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from routers.auth import _make_token
from services.book_interactions import update_interaction
from services.recommendation import _signals, get_recommendations
from services.schema_migrations import upgrade_schema
from timezone_utils import now_ph


def member(db, name="Synthetic reader", **kwargs):
    row = User(name=name, role=kwargs.pop("role", "member"), password_hash="synthetic-unused-hash", **kwargs)
    db.add(row)
    db.flush()
    return row


def book(db, title, **kwargs):
    row = Book(title=title, author=kwargs.pop("author", title), category=kwargs.pop("category", title),
               copies_total=1, copies_available=kwargs.pop("copies_available", 1), **kwargs)
    db.add(row)
    db.flush()
    return row


def loan(db, reader, title, **kwargs):
    row = Transaction(user_id=reader.id, book_id=title.id, type="return", status="returned",
                      borrow_date=kwargs.pop("borrow_date", now_ph()), **kwargs)
    db.add(row)
    db.flush()
    return row


def headers(reader):
    return {"Authorization": "Bearer " + _make_token(reader.id)}


def test_similarity_beats_global_popularity_on_synthetic_holdout(db_session):
    db = db_session
    reader, peer = member(db), member(db)
    seed, held_out, popular = book(db, "Seed"), book(db, "Held-out related book"), book(db, "Global hit")
    loan(db, reader, seed)
    update_interaction(db, peer.id, seed.id, favorite=True)
    update_interaction(db, peer.id, held_out.id, favorite=True)
    for _ in range(4):
        loan(db, member(db), popular)
    db.commit()
    recommendations = get_recommendations(reader.id, db)
    assert recommendations[0]["id"] == held_out.id
    assert recommendations[0]["source"] == "collaborative"
    # Held-out preference is not in the target member's inputs. A global loan
    # popularity baseline ranks Global hit first; this one synthetic case is
    # functional evidence, not a real-world quality/accuracy measurement.
    assert get_recommendations(member(db).id, db)[0]["id"] == popular.id


def test_binary_weights_and_removing_favorite_preserve_view(db_session):
    db = db_session
    reader, title = member(db), book(db, "Signals")
    for _ in range(3):
        loan(db, reader, title)
        update_interaction(db, reader.id, title.id, viewed=True)
        update_interaction(db, reader.id, title.id, favorite=True)
    assert db.execute(_signals()).one().weight == 9
    update_interaction(db, reader.id, title.id, favorite=False)
    assert db.execute(_signals()).one().weight == 6
    row = db.get(BookInteraction, (reader.id, title.id))
    assert row.viewed_at is not None and not row.is_favorite
    assert db.query(BookInteraction).count() == 1


def test_single_reader_does_not_claim_collaborative_evidence(db_session):
    db = db_session
    reader = member(db)
    first, second = book(db, "First exploration"), book(db, "Second exploration")
    for title in (first, second):
        update_interaction(db, reader.id, title.id, viewed=True)
    assert all(row["source"] != "collaborative" for row in get_recommendations(reader.id, db))


def test_available_first_exclusions_and_partial_fill(db_session):
    db = db_session
    reader, peer = member(db), member(db)
    seed = book(db, "Already returned")
    unavailable = book(db, "Relevant queue book", copies_available=0)
    available = book(db, "Newest available")
    reserved = book(db, "Reserved")
    ready = book(db, "Ready")
    cancelled = book(db, "Cancelled")
    loan(db, reader, seed)
    for title in (seed, unavailable):
        update_interaction(db, peer.id, title.id, favorite=True)
    for title, state in ((reserved, "pending"), (ready, "ready"), (cancelled, "cancelled")):
        db.add(Reservation(user_id=reader.id, book_id=title.id, status=state))
    db.commit()
    rows = get_recommendations(reader.id, db)
    assert {row["id"] for row in rows} == {available.id, unavailable.id, cancelled.id}
    assert rows[-1]["id"] == unavailable.id
    assert rows[-1]["source"] == "collaborative"
    assert len(get_recommendations(reader.id, db, limit=1)) == 1


def test_cold_start_content_and_new_fallbacks(db_session):
    db = db_session
    reader, peer = member(db), member(db)
    assert get_recommendations(reader.id, db) == []
    seed = book(db, "Favorite", category="Science")
    related = book(db, "Content match", category="Science")
    fresh = book(db, "Fresh")
    assert all(row["source"] == "new" for row in get_recommendations(reader.id, db))
    update_interaction(db, peer.id, seed.id, favorite=True)
    assert get_recommendations(reader.id, db)[0]["source"] == "popular"
    update_interaction(db, reader.id, seed.id, viewed=True)
    rows = {row["id"]: row for row in get_recommendations(reader.id, db)}
    assert rows[related.id]["source"] == "content"
    assert rows[fresh.id]["source"] == "new"


def test_popularity_window_and_ineligible_readers(db_session):
    db = db_session
    reader = member(db)
    old, active, excluded = book(db, "Old"), book(db, "Recent"), book(db, "Excluded reader activity")
    loan(db, member(db), old, borrow_date=now_ph() - timedelta(days=31))
    update_interaction(db, member(db).id, active.id, viewed=True)
    for peer in (member(db, status="suspended"), member(db, role="librarian")):
        update_interaction(db, peer.id, excluded.id, favorite=True)
        loan(db, peer, excluded)
    db.commit()
    rows = get_recommendations(reader.id, db)
    assert rows[0]["id"] == active.id and rows[0]["source"] == "popular"
    assert all(row["source"] == "new" for row in rows[1:])


def test_feedback_api_is_idempotent_private_and_validated(client, db_session):
    db = db_session
    reader, other, title = member(db), member(db), book(db, "API book")
    db.commit()
    auth = headers(reader)
    for _ in range(2):
        assert client.put(f"/api/user/favorites/{title.id}", headers=auth,
                          json={"user_id": other.id}).status_code == 204
        assert client.post(f"/api/user/book-views/{title.id}", headers=auth).status_code == 204
    assert client.get("/api/user/favorites", headers=auth).json() == [title.id]
    assert client.get("/api/user/favorites", headers=headers(other)).json() == []
    assert db.query(BookInteraction).count() == 1
    for _ in range(2):
        assert client.delete(f"/api/user/favorites/{title.id}", headers=auth).status_code == 204
    assert client.get("/api/user/favorites", headers=auth).json() == []
    assert client.put("/api/user/favorites/999999", headers=auth).status_code == 404
    assert client.post("/api/user/book-views/999999", headers=auth).status_code == 404
    response = client.get("/api/recommendations", headers=auth)
    assert response.status_code == 200
    assert set(response.json()[0]) == {"id", "title", "author", "category", "cover_url", "copies_available", "source", "reason"}
    assert client.get("/api/recommendations?limit=31", headers=auth).status_code == 422


@pytest.mark.parametrize("kind,status", [("anonymous", 401), ("librarian", 403), ("suspended", 401), ("password_change", 403)])
def test_access_restrictions(client, db_session, kind, status):
    db = db_session
    reader = member(db, role="librarian" if kind == "librarian" else "member",
                    status="suspended" if kind == "suspended" else "active",
                    must_change_password=kind == "password_change")
    title = book(db, "Protected")
    db.commit()
    auth = {} if kind == "anonymous" else headers(reader)
    for method, path in [("get", "/api/recommendations"), ("get", "/api/user/favorites"),
                         ("put", f"/api/user/favorites/{title.id}"),
                         ("delete", f"/api/user/favorites/{title.id}"),
                         ("post", f"/api/user/book-views/{title.id}")]:
        assert getattr(client, method)(path, headers=auth).status_code == status
    assert db.query(BookInteraction).count() == 0


def test_additive_migration_repeat_and_single_scoring_query(db_session):
    db = db_session
    reader, title = member(db), book(db, "Preserved")
    update_interaction(db, reader.id, title.id, favorite=True)
    with db.bind.begin() as connection:
        for _ in range(2):
            Base.metadata.create_all(connection)
            upgrade_schema(connection, Base.metadata)
        indexes = {index["name"] for index in inspect(connection).get_indexes("transactions")}
        assert "ix_transactions_recommendation_history" in indexes
    assert db.get(BookInteraction, (reader.id, title.id)).is_favorite
    statements = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)
    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        get_recommendations(reader.id, db)
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    assert len(statements) == 1
