from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from config import FINE_PER_DAY
from models.book import Book
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash, _make_token
from services.fines import current_fines, late_fee
from timezone_utils import PH_TZ


@pytest.mark.parametrize("hours,days", [(-24, 0), (0, 0), (23.99, 0), (24, 1), (47.99, 1), (48, 2)])
def test_fee_uses_completed_overdue_days_including_legacy_ph_dates(hours, days):
    due = datetime(2026, 11, 20, 14, tzinfo=PH_TZ)
    expected = Decimal(days * FINE_PER_DAY)
    at = due + timedelta(hours=hours)
    assert late_fee(due, at) == expected
    assert late_fee(due.replace(tzinfo=None), at.astimezone(timezone.utc)) == expected


def test_current_fines_are_consistent_read_only_and_librarian_scoped(client, db_session, monkeypatch):
    now = datetime(2026, 11, 26, 14, tzinfo=PH_TZ)
    monkeypatch.setattr("routers.librarian._now", lambda: now)
    monkeypatch.setattr("routers.transactions._now", lambda: now)
    monkeypatch.setattr("services.member_accountability.now_ph", lambda: now)
    staff = User(name="Synthetic Librarian", member_id="SYN-LIB", role="librarian", password_hash=_hash("Password1"))
    member = User(name="Synthetic Borrower", member_id="SYN-MEM", role="member", password_hash=_hash("Password1"))
    other = User(name="Synthetic Other", member_id="SYN-OTHER", role="member", password_hash=_hash("Password1"))
    book = Book(title="Synthetic fine title", author="Synthetic Author", category="General", year=2020, copies_total=5, copies_available=1)
    db_session.add_all([staff, member, other, book]); db_session.flush()
    loans = [Transaction(user_id=member.id, book_id=book.id, type="borrow", status="active",
        borrow_date=now-timedelta(days=20), due_date=now-timedelta(days=3)),
        Transaction(user_id=member.id, book_id=book.id, type="borrow", status="overdue",
            borrow_date=now-timedelta(days=20), due_date=now-timedelta(days=2)),
        Transaction(user_id=other.id, book_id=book.id, type="borrow", status="active",
            borrow_date=now-timedelta(days=14), due_date=now-timedelta(hours=2)),
        Transaction(user_id=other.id, book_id=book.id, type="return", status="returned",
            borrow_date=now-timedelta(days=20), due_date=now-timedelta(days=4),
            return_date=now-timedelta(days=1), fine_amount=Decimal("99")),
        Transaction(user_id=other.id, book_id=book.id, type="borrow", status="active",
            borrow_date=now-timedelta(days=2), due_date=now+timedelta(days=12))]
    db_session.add_all(loans); db_session.commit()
    expected = Decimal(5 * FINE_PER_DAY)
    summary = current_fines(db_session, at=now)
    assert summary["total"] == expected and summary["overdue_loans"] == 3
    assert summary["members_with_fines"] == 1
    assert current_fines(db_session, [other.id], now)["total"] == 0
    assert db_session.get(Transaction, loans[0].id).status == "active"
    assert db_session.get(Transaction, loans[0].id).fine_amount == 0
    assert db_session.get(Transaction, loans[3].id).fine_amount == 99
    tokens = [{"Authorization": "Bearer " + _make_token(user.id, db_session)} for user in (staff, member, other)]
    db_session.commit()
    assert client.get("/api/librarian/fines/summary").status_code == 401
    assert client.get("/api/librarian/fines/summary", headers=tokens[1]).status_code == 403
    response = client.get("/api/librarian/fines/summary", headers=tokens[0])
    assert response.status_code == 200 and Decimal(str(response.json()["total"])) == expected
    assert "by_member" not in response.json()
    members = client.get("/api/librarian/users", headers=tokens[0]).json()
    row = next(item for item in members if item["id"] == member.id)
    assert Decimal(row["current_overdue_fine"]) == expected
    record = client.get(f"/api/librarian/users/{member.id}/accountability", headers=tokens[0]).json()
    assert Decimal(str(record["current_overdue_fine"])) == expected
    assert client.get(f"/api/librarian/users/{member.id}/accountability", headers=tokens[2]).status_code == 403
    transactions = client.get("/api/transactions", headers=tokens[0]).json()
    amounts = {row["id"]: Decimal(row["fine_amount"]) for row in transactions}
    assert amounts[loans[0].id] == 3 * FINE_PER_DAY
    assert amounts[loans[3].id] == 99
    staff.status = "suspended"; db_session.commit()
    assert client.get("/api/librarian/fines/summary", headers=tokens[0]).status_code == 401
