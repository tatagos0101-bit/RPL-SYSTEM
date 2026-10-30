from io import BytesIO

import pytest
from openpyxl import Workbook
from sqlalchemy import inspect, text

from models.book import Book
from models.user import User
from routers.auth import _make_token
from services.category_service import MASTER_KEYWORDS, assign_category, mapped_parent, reconcile_categories, sanitize_label
from services.excel_service import parse_excel
from services.schema_migrations import upgrade_schema


@pytest.mark.parametrize("parent,keyword", [(parent, keyword) for parent, keywords in MASTER_KEYWORDS.items() for keyword in keywords])
def test_keyword_matrix(parent, keyword):
    assert mapped_parent(keyword.upper() + " / General -- Fiction:") == parent


def test_sanitization_compounds_and_short_keyword():
    assert sanitize_label("Romance -- Fiction: / General.") == "romance"
    assert mapped_parent("Science Fiction / General") == "Sci-Fi & Fantasy"
    assert mapped_parent("royalty") is None
    assert mapped_parent("Regency England -- Fiction") is None
    assert mapped_parent("Nonfiction") == "General"
    for parent in MASTER_KEYWORDS:
        assert mapped_parent(parent) == parent


def make_book(db, label, number):
    book = Book(title=f"Synthetic {number}", author="Test Author", category="General", copies_total=100, copies_available=100)
    assign_category(book, label)
    db.add(book)
    return book


def test_threshold_exact_labels_deletion_and_idempotence(db_session):
    books = [make_book(db_session, "Regency England -- Fiction", i) for i in range(10)]
    make_book(db_session, "regency england -- fiction", 11)
    reconcile_categories(db_session)
    assert all(book.is_hidden and book.category == "General" for book in books)
    eleventh = make_book(db_session, "Regency England -- Fiction", 12)
    reconcile_categories(db_session)
    assert all(not book.is_hidden and book.category == "Regency England -- Fiction" for book in books)
    assert reconcile_categories(db_session) == 0
    db_session.delete(eleventh)
    reconcile_categories(db_session)
    assert all(book.is_hidden for book in books)


def test_long_raw_labels_preserved_without_display_collision(db_session):
    labels = ["Unknown " + "z" * 100 + suffix for suffix in ("a", "b")]
    for label in labels:
        for i in range(11):
            make_book(db_session, label, i)
    reconcile_categories(db_session)
    books = db_session.query(Book).all()
    assert all(len(book.category) == 80 for book in books)
    assert len({book.category for book in books}) == 2
    assert {book.raw_api_label for book in books} == set(labels)


def test_excel_category_genre_header_and_default():
    wb = Workbook()
    ws = wb.active
    ws.append(["Title", "Author", "Category/Genre"])
    ws.append(["Test", "Author", "Juvenile / Fantasy"])
    ws.append(["Other", "Author", None])
    data = BytesIO()
    wb.save(data)
    rows = parse_excel(data.getvalue())
    assert rows[0]["category"] == "Juvenile / Fantasy"
    assert rows[1]["category"] == "General"


def staff_headers(db):
    user = User(name="Test librarian", role="librarian", password_hash="test")
    db.add(user)
    db.commit()
    return {"Authorization": "Bearer " + _make_token(user.id)}


def test_api_write_public_categories_review_and_permissions(client, db_session):
    headers = staff_headers(db_session)
    payload = {"title": "Test book", "author": "Test Author", "category": "Romance -- Fiction", "copies_total": 1}
    response = client.post("/api/inventory/books", json=payload, headers=headers)
    assert response.status_code == 201
    assert response.json()["category"] == "General"
    book_id = response.json()["id"]
    assert client.get("/api/inventory/category-review").status_code == 401
    member = User(name="Test member", role="member", password_hash="test")
    db_session.add(member)
    db_session.commit()
    member_headers = {"Authorization": "Bearer " + _make_token(member.id)}
    assert client.get("/api/inventory/category-review", headers=member_headers).status_code == 403
    queue = client.get("/api/inventory/category-review", headers=headers).json()
    assert queue == [{"raw_api_label": "Romance -- Fiction", "book_count": 1, "is_hidden": True}]
    assert client.get("/api/books/categories").json() == [{"category": "General", "count": 1}]
    # Saving another field with the displayed General category must retain original metadata.
    assert client.put(f"/api/inventory/books/{book_id}", json={"title": "Edited", "category": "General"}, headers=headers).status_code == 200
    resolution = {"raw_api_label": "Romance -- Fiction", "master_category": "Children & YA"}
    assert client.post("/api/inventory/category-review/resolve", json=resolution, headers=member_headers).status_code == 403
    assert client.post("/api/inventory/category-review/resolve", json=resolution, headers=headers).json()["updated"] == 1
    db_session.expire_all()
    book = db_session.get(Book, book_id)
    assert book.raw_api_label == "Romance -- Fiction"
    reconcile_categories(db_session)
    assert book.category == "Children & YA" and not book.is_hidden
    assert client.post("/api/inventory/category-review/resolve", json={**resolution, "master_category": "New category"}, headers=headers).status_code == 422


def test_suggestion_checks_all_provider_labels(client, db_session):
    headers = staff_headers(db_session)
    response = client.post("/api/inventory/category-suggestion", headers=headers,
                           json={"labels": ["Fiction", "Miscellaneous", "Science Fiction / Space Opera"]})
    assert response.status_code == 200
    assert response.json()["mapped_category"] == "Sci-Fi & Fantasy"
    assert response.json()["raw_api_label"] == "Science Fiction / Space Opera"


def test_additive_upgrade_and_backfill_repeatability(db_session):
    from sqlalchemy import create_engine
    from database import Base
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for name in ("raw_api_label", "category_override", "is_hidden"):
            conn.execute(text(f"ALTER TABLE books DROP COLUMN {name}"))
        conn.execute(text("INSERT INTO books (title, author, category, copies_total, copies_available) VALUES ('Test', 'Author', 'Cyberpunk / Fiction', 3, 2)"))
        upgrade_schema(conn, Base.metadata)
        upgrade_schema(conn, Base.metadata)
        assert {"raw_api_label", "category_override", "is_hidden"} <= {column["name"] for column in inspect(conn).get_columns("books")}
        assert conn.execute(text("SELECT copies_total, copies_available FROM books")).one() == (3, 2)
    from sqlalchemy.orm import Session
    with Session(engine) as db:
        assert reconcile_categories(db) == 1
        assert reconcile_categories(db) == 0
        book = db.query(Book).one()
        assert book.raw_api_label == "Cyberpunk / Fiction"
        assert book.category == "Sci-Fi & Fantasy"
    engine.dispose()
