"""Public discovery rankings use only synthetic inventory and activity."""
from datetime import datetime, timedelta

import pytest

from models.book import Book
from models.book_interaction import BookInteraction
from models.transaction import Transaction
from models.user import User

NOW = datetime(2026, 11, 16, 12)


def title(db, name, **values):
    row = Book(title=name, author=values.pop("author", "Synthetic Author"), category=values.pop("category", "Romance"),
               copies_total=1, copies_available=values.pop("copies_available", 1), created_at=values.pop("created_at", NOW), **values)
    db.add(row)
    db.flush()
    return row


def reader(db, **values):
    row = User(name="Synthetic Reader", role=values.pop("role", "member"), status=values.pop("status", "active"),
               password_hash="synthetic-unused-hash", **values)
    db.add(row)
    db.flush()
    return row


def loan(db, book, when=NOW, returned=True):
    user = reader(db)
    db.add(Transaction(user_id=user.id, book_id=book.id, borrow_date=when,
                       type="return" if returned else "borrow", status="returned" if returned else "active",
                       return_date=when + timedelta(hours=1) if returned else None))


def favorite(db, book, **values):
    user = reader(db, **values)
    db.add(BookInteraction(user_id=user.id, book_id=book.id, is_favorite=True))


def listing(client, **params):
    response = client.get("/api/books", params=params)
    assert response.status_code == 200
    return response.json()


def ids(data):
    return [row["id"] for row in data["items"]]


def test_newest_uses_library_creation_not_publication_year(client, db_session):
    old = title(db_session, "Alpha old library item", created_at=NOW - timedelta(days=60), year=2026)
    new = title(db_session, "Zulu new library item", created_at=NOW, year=1900)
    db_session.commit()
    assert ids(listing(client, sort="newest")) == [new.id, old.id]


def test_trending_includes_returns_within_thirty_days_not_old_loans(client, db_session, monkeypatch):
    monkeypatch.setattr("routers.books.now_ph", lambda: NOW)
    old = title(db_session, "Alpha old popular book")
    recent = title(db_session, "Middle recent book")
    best = title(db_session, "Zulu returned book")
    for _ in range(4): loan(db_session, old, NOW - timedelta(days=31))
    loan(db_session, recent, NOW - timedelta(days=1), returned=False)
    loan(db_session, best, NOW - timedelta(days=30))
    loan(db_session, best, NOW - timedelta(days=2))
    db_session.commit()
    assert ids(listing(client, sort="trending")) == [best.id, recent.id, old.id]


def test_most_loved_counts_active_member_favorites_only(client, db_session):
    ignored = title(db_session, "Alpha excluded favorites")
    one = title(db_session, "Middle one favorite")
    two = title(db_session, "Zulu two favorites")
    for values in ({"role":"librarian"}, {"status":"suspended"}, {"deleted_at":NOW}): favorite(db_session, ignored, **values)
    viewer = reader(db_session)
    db_session.add(BookInteraction(user_id=viewer.id, book_id=ignored.id, is_favorite=False, viewed_at=NOW))
    favorite(db_session, one)
    favorite(db_session, two)
    favorite(db_session, two)
    db_session.commit()
    data = listing(client, sort="loved", favorites_only=True)
    assert ids(data) == [two.id, one.id] and data["total"] == 2
    assert all("user_id" not in row and "member_id" not in row for row in data["items"])


def test_books_we_love_empty_does_not_label_unloved_books(client, db_session):
    title(db_session, "Unloved book")
    db_session.commit()
    data = listing(client, sort="loved", favorites_only=True)
    assert data["items"] == [] and data["total"] == 0


@pytest.mark.parametrize("sort", ["trending", "newest", "loved"])
def test_global_sort_and_ties_are_stable_before_paging(client, db_session, monkeypatch, sort):
    monkeypatch.setattr("routers.books.now_ph", lambda: NOW)
    rows = [title(db_session, name) for name in ("Alpha", "Bravo", "Charlie", "Delta")]
    for book in rows:
        loan(db_session, book)
        favorite(db_session, book)
    db_session.commit()
    first = listing(client, sort=sort, limit=2)
    second = listing(client, sort=sort, limit=2, skip=2)
    assert ids(first) + ids(second) == [row.id for row in reversed(rows)]
    assert first["total"] == second["total"] == 4
    assert not set(ids(first)) & set(ids(second))


@pytest.mark.parametrize("sort", ["trending", "newest", "loved", "title"])
def test_rankings_respect_genre_search_availability_and_favorite_count(client, db_session, monkeypatch, sort):
    monkeypatch.setattr("routers.books.now_ph", lambda: NOW)
    match = title(db_session, "Synthetic match", category="Romance")
    others = [title(db_session, "Synthetic unavailable", copies_available=0),
              title(db_session, "Synthetic other genre", category="History"),
              title(db_session, "Unrelated title", author="Other Author"), title(db_session, "Synthetic not loved")]
    for book in [match, *others[:-1]]:
        favorite(db_session, book)
        loan(db_session, book)
    db_session.commit()
    data = listing(client, sort=sort, favorites_only=True, category="Romance", search="Synthetic", available_only=True)
    assert ids(data) == [match.id] and data["total"] == 1


@pytest.mark.parametrize("term,match,other", [("100%", "100% pure reading", "1000 other"),
    ("A_B", "A_B guide", "ACB guide"), ("C\\D", "C\\D guide", "CD guide")])
def test_search_wildcards_and_escape_characters_are_literal(client, db_session, term, match, other):
    expected = title(db_session, match)
    title(db_session, other)
    db_session.commit()
    assert ids(listing(client, search=term)) == [expected.id]


def test_default_title_order_and_public_shape_remain_compatible(client, db_session):
    second = title(db_session, "Zulu", created_at=NOW)
    first = title(db_session, "Alpha", created_at=NOW - timedelta(days=1))
    db_session.commit()
    data = listing(client)
    assert ids(data) == [first.id, second.id]
    assert set(data) == {"total", "skip", "limit", "items"}


@pytest.mark.parametrize("sort", ["rating", "bad_sort", "trending;DROP TABLE books"])
def test_invalid_sort_is_rejected(client, sort):
    assert client.get("/api/books", params={"sort":sort}).status_code == 422
