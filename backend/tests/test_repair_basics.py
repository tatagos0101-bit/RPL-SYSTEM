from datetime import timedelta

from models.user import User
from models.book import Book
from models.entry_log import EntryLog
from models.transaction import Transaction
from routers.auth import _make_token
from timezone_utils import now_ph


def member(db, role="member"):
    user = User(name="Repair fixture", role=role, password_hash="unused",
                phone="09123456789", location="Test location")
    db.add(user)
    db.commit()
    token = _make_token(user.id, db)
    db.commit()
    return user, {"Authorization": f"Bearer {token}"}


def test_profile_explicit_clear_and_omitted_fields(client, db_session):
    _, headers = member(db_session)
    response = client.put("/api/user/profile", headers=headers, json={"phone": None})
    assert response.status_code == 200
    assert response.json()["phone"] is None
    assert response.json()["location"] == "Test location"
    response = client.put("/api/user/profile", headers=headers, json={"location": ""})
    assert response.json()["location"] is None


def test_report_rejects_unsupported_years(client, db_session):
    _, headers = member(db_session, "librarian")
    for year in (10000, 9999):
        assert client.get(f"/api/reports/monthly?month=12&year={year}", headers=headers).status_code == 422


def test_denied_entries_do_not_count_in_member_progress(client, db_session):
    user, headers = member(db_session)
    for granted in (True, False):
        db_session.add(EntryLog(user_id=user.id, granted=granted, accessed_at=now_ph()))
    db_session.commit()
    assert client.get("/api/user/reading-stats", headers=headers).json()["total_visits"] == 1
    assert sum(day["visits"] for day in client.get("/api/user/activity", headers=headers).json()) == 1
    goals = client.put("/api/user/goals", headers=headers,
                       json={"annual_books": 10, "genres": 3, "visits": 5}).json()
    assert next(g for g in goals if g["goal_type"] == "visits")["current"] == 1


def test_report_borrowed_stock_excludes_unavailable_nonloans(client, db_session, monkeypatch):
    from services import report_service
    user, headers = member(db_session, "librarian")
    book = Book(title="Fixture", author="Fixture", category="Test", copies_total=4, copies_available=1)
    db_session.add(book)
    db_session.flush()
    db_session.add(Transaction(user_id=user.id, book_id=book.id, type="borrow", status="active",
                               borrow_date=now_ph(), due_date=now_ph() + timedelta(days=14)))
    db_session.commit()
    captured = {}
    def capture(label, stats, books, members):
        captured.update(stats)
        return b"synthetic PDF"
    monkeypatch.setattr(report_service, "build_monthly_report", capture)
    assert client.get("/api/reports/monthly?month=10&year=2026", headers=headers).status_code == 200
    assert captured["borrowed_copies"] == 1
