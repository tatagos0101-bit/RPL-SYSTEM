from datetime import timedelta

from models.book import Book
from models.reservation import Reservation
from models.user import User
from routers.auth import _hash
from services.reservation_policy import sync_expired_reservations
from timezone_utils import now_ph


def create_member(db, name="Member", email="member@example.test"):
    user = User(
        name=name,
        email=email,
        password_hash=_hash("Password1"),
        role="member",
        member_id=f"RPL-{name.upper()[:3]}01",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_librarian(db):
    user = User(
        name="Librarian",
        email="lib@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        member_id="RPL-LIB01",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_book(db, title="Test Book", available=1, total=1):
    book = Book(
        title=title,
        author="Author",
        category="General",
        copies_total=total,
        copies_available=available,
        qr_code=f"QR-{title.replace(' ', '-')}",
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_unavailable_book_can_be_reserved_as_pending_queue_item(client, db_session):
    member = create_member(db_session)
    book = create_book(db_session, "Unavailable Book", available=0, total=1)
    token = login(client, member.email)

    response = client.post(
        "/api/reservations",
        headers={"Authorization": f"Bearer {token}"},
        json={"book_id": book.id},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["book_id"] == book.id
    assert body["status"] == "pending"
    assert body["queue_position"] == 1
    assert body["expires_at"] is None


def test_available_book_reservation_is_ready_with_pickup_expiry(client, db_session):
    member = create_member(db_session)
    book = create_book(db_session, "Available Book", available=1, total=1)
    token = login(client, member.email)

    response = client.post(
        "/api/reservations",
        headers={"Authorization": f"Bearer {token}"},
        json={"book_id": book.id},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["book_id"] == book.id
    assert body["status"] == "ready"
    assert body["expires_at"] is not None


def test_expired_ready_reservations_are_cancelled_before_member_list(client, db_session):
    member = create_member(db_session)
    book = create_book(db_session, "Expired Ready Book", available=1, total=1)
    reservation = Reservation(
        user_id=member.id,
        book_id=book.id,
        status="ready",
        queue_position=1,
        expires_at=now_ph() - timedelta(minutes=5),
    )
    db_session.add(reservation)
    db_session.commit()
    token = login(client, member.email)

    response = client.get("/api/reservations", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == []
    db_session.refresh(reservation)
    assert reservation.status == "cancelled"


def test_sync_expired_reservations_promotes_next_pending_when_copy_is_available(db_session):
    first = create_member(db_session, name="First", email="first@example.test")
    second = create_member(db_session, name="Second", email="second@example.test")
    third = create_member(db_session, name="Third", email="third@example.test")
    book = create_book(db_session, "Queued Book", available=1, total=1)
    expired = Reservation(
        user_id=first.id,
        book_id=book.id,
        status="ready",
        queue_position=1,
        expires_at=now_ph() - timedelta(hours=1),
    )
    pending_one = Reservation(
        user_id=second.id,
        book_id=book.id,
        status="pending",
        queue_position=2,
    )
    pending_two = Reservation(
        user_id=third.id,
        book_id=book.id,
        status="pending",
        queue_position=3,
    )
    db_session.add_all([expired, pending_one, pending_two])
    db_session.commit()

    changed = sync_expired_reservations(db_session)

    assert changed == 1
    db_session.refresh(expired)
    db_session.refresh(pending_one)
    db_session.refresh(pending_two)
    assert expired.status == "cancelled"
    assert pending_one.status == "ready"
    assert pending_one.expires_at is not None
    assert pending_two.queue_position == 1
