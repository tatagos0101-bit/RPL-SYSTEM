from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func

from models.book import Book
from models.book_copy import BookCopy
from models.member_account_action import MemberAccountAction
from models.member_application import MemberApplication
from models.notification import Notification
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash, _make_token
from services.book_copy_service import ensure_book_copies
from timezone_utils import as_ph, now_ph


def setup(db):
    member = User(name="Synthetic Reader", member_id="RPL-SYN-READ", role="member", password_hash=_hash("Password1"))
    staff = User(name="Synthetic Librarian", role="librarian", password_hash=_hash("Password1"))
    other = User(name="Other Synthetic Reader", role="member", password_hash=_hash("Password1"))
    book = Book(title="Synthetic circulation title", author="Synthetic Author", category="General",
        year=2020, copies_total=1, copies_available=1, is_hidden=False)
    db.add_all([member, staff, other, book]); db.commit()
    ensure_book_copies(db, book.id)
    headers = [{"Authorization": "Bearer " + _make_token(user.id, db)} for user in (member, staff, other)]
    db.commit()
    return member, staff, other, book, headers


def borrow(client, book, member, headers):
    response = client.post("/api/transactions/borrow", json={"user_id": member.id, "book_id": book.id}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def return_payload(loan, **changes):
    return dict(transaction_id=loan["id"], user_id=loan["user_id"], book_id=loan["book_id"], copy_id=loan["copy_id"],
        inspection_confirmed=True, return_condition="good", inspection_reason="no_issues", **changes)


def test_reference_titles_block_borrow_reserve_and_scan(client, db_session):
    member, staff, other, book, h = setup(db_session)
    book.is_borrowable = False; book.circulation_note = "Read at reference desk"; db_session.commit()
    assert client.post("/api/transactions/borrow", headers=h[1], json={"user_id": member.id, "book_id": book.id}).status_code == 409
    assert client.post("/api/reservations", headers=h[0], json={"book_id": book.id}).status_code == 409
    scanned = client.get("/api/transactions/scan", headers=h[1], params={"mode": "borrow", "code": book.copies[0].qr_code})
    assert scanned.status_code == 200 and not scanned.json()["candidates"][0]["available"]
    assert client.get(f"/api/books/{book.id}").json()["availability_status"] == "Library use only"
    assert db_session.query(Transaction).count() == 0


def test_changing_to_reference_cancels_holds_without_erasing_loans(client, db_session):
    member, staff, other, book, h = setup(db_session)
    reservation = Reservation(user_id=member.id, book_id=book.id, status="ready", expires_at=now_ph() + timedelta(hours=4))
    db_session.add(reservation); db_session.commit()
    response = client.put(f"/api/inventory/books/{book.id}", headers=h[1], json={"is_borrowable": False})
    assert response.status_code == 200, response.text
    db_session.refresh(reservation)
    assert reservation.status == "cancelled"
    assert db_session.query(Notification).filter_by(user_id=member.id, type="reservation_cancelled").count() == 1
    assert db_session.query(BookCopy).count() == 1


def test_return_requires_inspection_and_preserves_original_loan(client, db_session):
    member, staff, other, book, h = setup(db_session)
    loan = borrow(client, book, member, h[1])
    old = {key: loan[key] for key in ("user_id", "book_id", "copy_id", "id")}
    assert client.post("/api/transactions/return", headers=h[1], json={"user_id": member.id, "book_id": book.id}).status_code == 422
    assert client.post("/api/transactions/return", headers=h[0], json=return_payload(loan)).status_code == 403
    key = {"Idempotency-Key": str(uuid4()), **h[1]}
    result = client.post("/api/transactions/return", headers=key, json=return_payload(loan))
    assert result.status_code == 200, result.text
    assert result.json()["inspected_by_id"] == staff.id
    assert result.json()["return_condition"] == "good"
    assert result.json()["borrow_date"] == loan["borrow_date"]
    assert all(result.json()[name] == value for name, value in old.items())
    assert client.post("/api/transactions/return", headers=key, json=return_payload(loan)).json() == result.json()
    db_session.expire_all()
    assert db_session.get(Book, book.id).copies_available == 1
    assert db_session.query(Transaction).count() == 1


@pytest.mark.parametrize("condition,remark", [("damaged", "torn_pages"), ("lost", "reported_lost")])
def test_damaged_lost_copies_and_assessments_remain_accountable(client, db_session, condition, remark):
    member, staff, other, book, h = setup(db_session)
    loan = borrow(client, book, member, h[1])
    tx = db_session.get(Transaction, loan["id"]); tx.due_date = now_ph() - timedelta(days=2, minutes=1)
    db_session.add(Reservation(user_id=other.id, book_id=book.id, status="pending")); db_session.commit()
    payload = return_payload(loan)
    payload.update(return_condition=condition, inspection_reason=remark, condition_fee="125.50", inspection_notes="Synthetic assessment")
    response = client.post("/api/transactions/return", headers=h[1], json=payload)
    assert response.status_code == 200, response.text
    row = response.json()
    assert Decimal(row["fine_amount"]) == Decimal(row["late_fee"]) + Decimal("125.50")
    db_session.expire_all()
    assert db_session.get(Book, book.id).copies_available == 0
    copy = db_session.get(BookCopy, loan["copy_id"])
    assert copy.status == condition and copy.condition == condition
    assert db_session.query(Reservation).filter_by(user_id=other.id).one().status == "pending"
    assert db_session.get(User, member.id).status == "active"  # No unapproved automatic restriction.
    own = client.get("/api/user/accountability", headers=h[0])
    assert own.status_code == 200 and own.json()["total"] == 1
    assert own.json()["records"][0]["transaction_id"] == loan["id"]
    assert client.get("/api/user/accountability", headers=h[2]).json()["total"] == 0
    filters = {"category": "circulation", "start": (now_ph() - timedelta(days=30)).date().isoformat(),
        "end": now_ph().date().isoformat(), "period": "custom", "return_condition": condition}
    report = client.post("/api/reporting/query", headers=h[1], json={"filters": filters})
    assert report.status_code == 200, report.text
    detail = report.json()
    assert detail["total"] == 1 and detail["rows"][0]["inspection_remark"] == remark
    assert detail["rows"][0]["publication_year"] == 2020
    assert detail["summary"]["reported_lost"] == (1 if condition == "lost" else 0)
    assert detail["summary"]["returns"] == (0 if condition == "lost" else 1)
    collection = client.post("/api/reporting/query", headers=h[1], json={"filters": {**filters, "category": "collection", "return_condition": "", "date_scope": "all"}})
    assert collection.status_code == 200, collection.text
    assert collection.json()["rows"][0]["distinct_borrowers_in_period"] == 1
    fixed = client.put(f"/api/inventory/book-copies/{copy.id}/condition", headers=h[1],
        json={"condition": "good", "reason": "found" if condition == "lost" else "repaired", "notes": "Synthetic inspection"})
    assert fixed.status_code == 200, fixed.text
    db_session.expire_all()
    assert db_session.get(Book, book.id).copies_available == 1
    assert db_session.get(BookCopy, copy.id).qr_code == copy.qr_code
    assert db_session.get(Transaction, loan["id"]).return_condition == condition


def test_invalid_assessment_and_uninspected_return_cannot_close_loan(client, db_session):
    member, staff, other, book, h = setup(db_session)
    loan = borrow(client, book, member, h[1])
    for changes in [{"inspection_confirmed": False}, {"condition_fee": "-1"}, {"condition_fee": "20"},
                    {"return_condition": "damaged", "inspection_reason": "no_issues"},
                    {"return_condition": "damaged", "inspection_reason": "other", "inspection_notes": " "}]:
        payload = return_payload(loan); payload.update(changes)
        assert client.post("/api/transactions/return", headers=h[1], json=payload).status_code == 422
    db_session.expire_all()
    assert db_session.get(Transaction, loan["id"]).return_date is None
    assert db_session.get(BookCopy, loan["copy_id"]).status == "borrowed"


def test_blacklist_requires_librarian_and_revokes_access(client, db_session):
    member, staff, other, book, h = setup(db_session)
    path = f"/api/librarian/users/{member.id}/actions"
    payload = {"action": "blacklist", "reason": "repeated_violations", "notes": "Synthetic reviewed record"}
    assert client.post(path, headers=h[0], json=payload).status_code == 403
    client.cookies.clear()
    assert client.post(path, json=payload).status_code == 401
    assert client.post(path, headers=h[1], json=payload).status_code == 200
    assert client.get("/api/user/profile", headers=h[0]).status_code == 401
    assert client.post("/api/auth/login", json={"email": member.member_id, "password": "Password1"}).status_code == 403
    assert client.post("/api/transactions/borrow", headers=h[1], json={"user_id": member.id, "book_id": book.id}).status_code == 403
    assert client.post(path, headers=h[1], json={"action": "reactivate", "reason": "resolved"}).status_code == 200
    db_session.expire_all()
    assert not db_session.get(User, member.id).is_blacklisted
    assert db_session.query(MemberAccountAction).filter_by(user_id=member.id).count() == 2


def test_remote_application_issues_receipt_not_account_then_approval(client, db_session):
    member, staff, other, book, h = setup(db_session)
    response = client.post("/api/membership/applications", json={"name": "Synthetic Applicant", "email": "synthetic-applicant@example.com", "location": "Synthetic Address", "accept_terms": True})
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending" and "access_token" not in response.json()
    assert "set-cookie" not in response.headers
    assert db_session.query(User).count() == 3
    app = db_session.query(MemberApplication).one()
    path = f"/api/librarian/applications/{app.id}/review"
    payload = {"decision": "approve", "reason": "details_verified", "identity_checked": True}
    assert client.get("/api/librarian/applications", headers=h[0]).status_code == 403
    assert client.post(path, headers=h[0], json=payload).status_code == 403
    assert client.post(path, headers=h[1], json={**payload, "identity_checked": False}).status_code == 422
    result = client.post(path, headers=h[1], json=payload)
    assert result.status_code == 200, result.text
    issued = result.json()
    assert issued["temporary_password"] and len(issued["temporary_password"]) == 10
    approved = db_session.query(User).filter_by(member_id=issued["member_id"]).one()
    assert approved.role == "member" and approved.must_change_password and approved.privacy_consent_pending
    assert not approved.email_verified
    assert as_ph(approved.temporary_password_expires_at) > now_ph() + timedelta(hours=23)
    assert client.post(path, headers=h[1], json=payload).status_code == 409
    assert db_session.query(User).count() == 4
    login = client.post("/api/auth/login", json={"email": issued["member_id"], "password": issued["temporary_password"]})
    assert login.status_code == 200 and login.json()["must_change_password"]
    assert client.get("/api/user/loans").status_code == 403


def test_public_application_does_not_accept_staff_role_or_missing_terms(client, db_session):
    base = {"name": "Synthetic Applicant", "location": "Synthetic Address", "accept_terms": True}
    assert client.post("/api/membership/applications", json={**base, "role": "librarian"}).status_code == 422
    assert client.post("/api/membership/applications", json={**base, "accept_terms": False}).status_code == 422
    assert client.post("/api/membership/applications", json={**base, "name": " "}).status_code == 422
    assert client.post("/api/auth/signup", json={"name": "Synthetic", "email": "synthetic@example.com", "password": "Password1"}).status_code == 403
    assert db_session.query(User).count() == 0


def test_no_email_application_and_rejection_do_not_issue_credentials(client, db_session):
    member, staff, other, book, h = setup(db_session)
    result = client.post("/api/membership/applications", json={"name": "Synthetic No Email", "location": "Synthetic Address", "accept_terms": True})
    assert result.status_code == 201 and "password" not in result.text
    application = db_session.query(MemberApplication).one()
    path = f"/api/librarian/applications/{application.id}/review"
    result = client.post(path, headers=h[1], json={"decision": "reject", "reason": "incomplete_details"})
    assert result.status_code == 200 and "temporary_password" not in result.json()
    assert db_session.query(User).count() == 3
    assert client.post(path, headers=h[1], json={"decision": "approve", "reason": "details_verified", "identity_checked": True}).status_code == 409


def test_stock_inspection_cannot_alter_an_active_or_retired_copy(client, db_session):
    member, staff, other, book, h = setup(db_session)
    loan = borrow(client, book, member, h[1])
    payload = {"condition": "good", "reason": "stock_inspection", "notes": "Synthetic check"}
    path = f"/api/inventory/book-copies/{loan['copy_id']}/condition"
    assert client.put(path, headers=h[1], json=payload).status_code == 409
    assert client.put(path, headers=h[0], json=payload).status_code == 403
    assert client.put(path, headers=h[1], json={**payload, "notes": " "}).status_code == 422
