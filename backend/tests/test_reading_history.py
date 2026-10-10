from io import BytesIO

from pypdf import PdfReader
import pytest

from models.book import Book
from models.user import User
from routers.auth import _hash, _make_token
from timezone_utils import now_ph


@pytest.fixture()
def returned_loan(client, db_session):
    member = User(name="History member", member_id="RPL-HISTORY", role="member", password_hash=_hash("Password1"))
    librarian = User(name="History librarian", role="librarian", password_hash=_hash("Password1"))
    borrowed = Book(title="Returned history book", author="QA", category="History", copies_total=1, copies_available=1)
    unread = Book(title="Unread history book", author="QA", category="History", copies_total=1, copies_available=1)
    db_session.add_all([member, librarian, borrowed, unread])
    db_session.commit()
    staff_headers = {"Authorization": "Bearer " + _make_token(librarian.id)}
    member_headers = {"Authorization": "Bearer " + _make_token(member.id)}
    body = {"user_id": member.id, "book_id": borrowed.id}
    assert client.post("/api/transactions/borrow", json=body, headers=staff_headers).status_code == 201
    assert client.post("/api/transactions/return", json=body, headers=staff_headers).status_code == 200
    return member, borrowed, unread, member_headers, staff_headers


def test_return_preserves_reading_stats_goals_member_totals_and_trends(client, returned_loan):
    member, borrowed, unread, member_headers, staff_headers = returned_loan
    stats = client.get("/api/user/reading-stats", headers=member_headers).json()
    assert stats["total_books_read"] == 1
    assert stats["favorite_category"] == "History"
    goals = client.put("/api/user/goals", headers=member_headers,
                       json={"annual_books": 10, "genres": 3, "visits": 5}).json()
    assert next(g for g in goals if g["goal_type"] == "annual_books")["current"] == 1
    assert next(g for g in goals if g["goal_type"] == "genres")["current"] == 1
    members = client.get("/api/librarian/users", headers=staff_headers).json()
    assert next(m for m in members if m["id"] == member.id)["total_loans"] == 1
    assert client.get("/api/librarian/borrow-trend", params={"months": 1}, headers=staff_headers).json()[0]["borrows"] == 1
    # Already-read books stay excluded and their genre still informs suggestions.
    recommendations = client.get("/api/recommendations", headers=member_headers).json()
    assert borrowed.id not in {book["id"] for book in recommendations}
    assert unread.id in {book["id"] for book in recommendations}


def test_transcript_and_monthly_report_keep_returned_borrow_history(client, returned_loan, monkeypatch):
    member, borrowed, unread, member_headers, staff_headers = returned_loan
    transcript = client.get("/api/reports/transcript", headers=member_headers)
    assert transcript.status_code == 200
    content = "\n".join(page.extract_text() for page in PdfReader(BytesIO(transcript.content)).pages)
    assert borrowed.title in content
    assert "No borrow history found" not in content
    from services import report_service
    original = report_service.build_monthly_report
    captured = {}
    def report(month_label, stats, top_books, top_members):
        captured.update(stats=stats, books=top_books, members=top_members)
        return original(month_label, stats, top_books, top_members)
    monkeypatch.setattr(report_service, "build_monthly_report", report)
    now = now_ph()
    response = client.get("/api/reports/monthly", headers=staff_headers, params={"month": now.month, "year": now.year})
    assert response.status_code == 200
    assert captured["stats"]["borrows"] == captured["stats"]["returns"] == 1
    assert captured["books"][0]["title"] == borrowed.title
    assert captured["members"][0]["member_id"] == member.member_id
