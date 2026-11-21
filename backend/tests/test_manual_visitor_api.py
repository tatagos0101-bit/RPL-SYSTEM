from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid1, uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

import config
from database import Base
from limiter import limiter
from models.entry_log import EntryLog
from models.user import User
from routers.auth import _make_token
from schemas.librarian import ManualVisitorEntryRequest
from services.entry_station_pin import set_station_pin
from services.manual_visitor_service import close_manual_entry, create_manual_entry
from timezone_utils import now_ph


ENTRIES = "/api/kiosk/manual-entries"
SEARCH = f"{ENTRIES}/search"
PIN = {"X-Entry-Station-Pin": "504218"}


@pytest.fixture(autouse=True)
def station_pin(monkeypatch):
    monkeypatch.setattr(config, "ENTRY_STATION_PIN", PIN["X-Entry-Station-Pin"])


@pytest.fixture
def visitor():
    return {"request_id": str(uuid4()), "visitor_name": "  Mar\u00eda Dela Cruz  ",
            "visitor_location": "  Antipolo, Rizal  "}


def test_create_requires_current_pin_before_any_write(client, db_session, visitor):
    assert client.post(ENTRIES, json=visitor).status_code == 403
    assert client.post(ENTRIES, json=visitor, headers={"X-Entry-Station-Pin": "wrong"}).status_code == 403
    set_station_pin(db_session, "299541")
    db_session.commit()
    assert client.post(ENTRIES, json=visitor, headers=PIN).status_code == 403
    assert db_session.query(EntryLog).count() == 0


@pytest.mark.parametrize(("field", "value"), [
    ("visitor_name", "   "), ("visitor_location", "\u2003"),
    ("visitor_name", "A" * 151), ("visitor_location", "A" * 201),
    ("visitor_name", "\x00Visitor"), ("visitor_location", "Rizal\n"),
    ("visitor_name", "Visitor\u202eName"),
    ("request_id", str(uuid1())), ("request_id", "invalid-uuid"),
])
def test_create_rejects_invalid_input(client, db_session, visitor, field, value):
    visitor[field] = value
    assert client.post(ENTRIES, json=visitor, headers=PIN).status_code == 422
    assert db_session.query(EntryLog).count() == 0


def test_create_records_guest_and_returns_private_details_to_authorized_reads(client, db_session, visitor):
    response = client.post(ENTRIES, json=visitor, headers=PIN)
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    row = response.json()
    assert row["visitor_name"] == row["member_name"] == "Mar\u00eda Dela Cruz"
    assert row["visitor_location"] == "Antipolo, Rizal"
    assert row["entry_type"] == "manual" and row["granted"] is True and row["is_inside"] is True
    assert row["member_id"] is None and row["time_out"] is None
    assert "manual_request_id" not in row and "access_token" not in row
    assert db_session.query(User).count() == 0
    assert db_session.get(EntryLog, row["id"]).user_id is None

    kiosk_logs = "/api/kiosk/entry-logs"
    librarian_logs = "/api/librarian/entry-logs"
    assert client.get(kiosk_logs).status_code == 403
    assert client.get(librarian_logs).status_code == 401
    assert client.get(kiosk_logs, headers=PIN).json() == [row]

    staff = User(name="Test Librarian", email="visitor-staff@example.test", role="librarian",
                 status="active", password_hash="synthetic")
    member = User(name="Test Member", email="visitor-member@example.test", role="member",
                  status="active", password_hash="synthetic")
    db_session.add_all([staff, member])
    db_session.commit()
    assert client.get(librarian_logs, headers={"Authorization": f"Bearer {_make_token(member.id)}"}).status_code == 403
    assert client.get(librarian_logs, headers={"Authorization": f"Bearer {_make_token(staff.id)}"}).json() == [row]


def test_create_reuses_uuid_only_when_normalized_payload_matches(client, db_session, visitor):
    created = client.post(ENTRIES, json=visitor, headers=PIN).json()
    visitor["visitor_name"] = visitor["visitor_name"].strip()
    assert client.post(ENTRIES, json=visitor, headers=PIN).json() == created
    different = {**visitor, "visitor_location": "Cainta, Rizal"}
    assert client.post(ENTRIES, json=different, headers=PIN).status_code == 409
    next_visit = {**visitor, "request_id": str(uuid4())}
    assert client.post(ENTRIES, json=next_visit, headers=PIN).json()["id"] != created["id"]
    assert db_session.query(EntryLog).count() == 2


def test_exit_preserves_first_times_and_create_retry_returns_closed_entry(client, db_session, visitor):
    created = client.post(ENTRIES, json=visitor, headers=PIN).json()
    exit_path = f"{ENTRIES}/{created['id']}/exit"
    assert client.post(exit_path).status_code == 403
    assert client.post(exit_path, headers={"X-Entry-Station-Pin": "wrong"}).status_code == 403
    assert db_session.get(EntryLog, created["id"]).time_out is None

    response = client.post(exit_path, headers=PIN)
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    closed = response.json()
    assert closed["time_out"] is not None and closed["is_inside"] is False
    assert closed["accessed_at"] == created["accessed_at"]
    assert client.post(exit_path, headers=PIN).json() == closed
    assert client.post(ENTRIES, json=visitor, headers=PIN).json() == closed


def test_exit_rejects_nonvisitor_and_denied_records(client, db_session):
    member = User(name="Test Member", email="exit-member@example.test", role="member",
                  status="active", password_hash="synthetic")
    db_session.add(member)
    db_session.flush()
    logs = [
        EntryLog(entry_type="face_scan", granted=True, accessed_at=now_ph()),
        EntryLog(entry_type="manual", granted=True, accessed_at=now_ph()),
        EntryLog(entry_type="manual", granted=True, user_id=member.id, accessed_at=now_ph()),
        EntryLog(entry_type="manual", granted=False, manual_request_id=str(uuid4()), accessed_at=now_ph()),
    ]
    db_session.add_all(logs)
    db_session.commit()
    for log in logs:
        assert client.post(f"{ENTRIES}/{log.id}/exit", headers=PIN).status_code == 404
        db_session.refresh(log)
        assert log.time_out is None


def test_manual_list_is_pin_protected_and_searches_across_days(client, db_session, visitor):
    assert client.get(ENTRIES).status_code == 403
    assert client.get(ENTRIES, headers={"X-Entry-Station-Pin": "wrong"}).status_code == 403
    assert client.post(SEARCH, json={}).status_code == 403
    older = client.post(ENTRIES, json=visitor, headers=PIN).json()
    db_session.get(EntryLog, older["id"]).accessed_at = now_ph() - timedelta(days=2)
    db_session.add(EntryLog(entry_type="manual", granted=True, accessed_at=now_ph(),
                            visitor_name="Legacy Visitor", visitor_location="Antipolo"))
    db_session.commit()
    newer = client.post(ENTRIES, headers=PIN, json={
        **visitor, "request_id": str(uuid4()), "visitor_name": "Test Visitor",
    }).json()

    first = client.post(SEARCH, headers=PIN, json={"search": " antipolo ", "limit": 1}).json()
    assert first == {"items": [newer], "total": 2}
    second = client.post(SEARCH, headers=PIN, json={"search": "Antipolo", "skip": 1, "limit": 1}).json()
    assert second["total"] == 2 and [row["id"] for row in second["items"]] == [older["id"]]
    assert client.get(ENTRIES, headers=PIN, params={"skip": 3}).json() == {"items": [], "total": 2}
    assert client.post(SEARCH, headers=PIN, json={"search": "%"}).json() == {"items": [], "total": 0}
    assert client.post(SEARCH, headers=PIN, json={"search": "DELA CRUZ"}).json()["total"] == 1
    assert client.get(ENTRIES, headers=PIN, params={"search": "DELA CRUZ"}).json()["total"] == 2

    client.post(f"{ENTRIES}/{newer['id']}/exit", headers=PIN)
    assert client.get(ENTRIES, headers=PIN).json()["total"] == 1
    assert client.get(ENTRIES, headers=PIN, params={"open_only": "false"}).json()["total"] == 2
    assert client.get(ENTRIES, headers=PIN, params={"limit": 101}).status_code == 422
    assert client.get(ENTRIES, headers=PIN, params={"skip": 2**80}).status_code == 422
    assert client.post(SEARCH, headers=PIN, json={"search": "Rizal\x00"}).status_code == 422
    assert client.post(f"{ENTRIES}/{2**80}/exit", headers=PIN).status_code == 422


def test_invalid_station_pins_count_toward_limits(client, db_session, monkeypatch, visitor):
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    try:
        wrong_pin = {"X-Entry-Station-Pin": "wrong"}
        for _ in range(30):
            assert client.post(ENTRIES, json=visitor, headers=wrong_pin).status_code == 403
        assert client.post(ENTRIES, json=visitor, headers=wrong_pin).status_code == 429
        assert db_session.query(EntryLog).count() == 0

        logs = "/api/kiosk/entry-logs"
        for _ in range(60):
            assert client.get(logs, headers=wrong_pin).status_code == 403
        assert client.get(logs, headers=wrong_pin).status_code == 429

        for entry_id in range(1, 31):
            assert client.post(f"{ENTRIES}/{entry_id}/exit", headers=wrong_pin).status_code == 403
        assert client.post(f"{ENTRIES}/31/exit", headers=wrong_pin).status_code == 429
    finally:
        limiter.reset()


def test_concurrent_retries_keep_one_entry_and_one_exit_time(tmp_path, visitor):
    # Separate database connections exercise the unique constraint and conditional write.
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'manual-race.sqlite3'}")
    Base.metadata.create_all(engine)
    body = ManualVisitorEntryRequest(**visitor)
    insert_ready = Barrier(2, timeout=5)
    exit_ready = Barrier(2, timeout=5)

    def create():
        with Session(engine) as db:
            event.listen(db, "before_flush", lambda *_: insert_ready.wait())
            return create_manual_entry(db, body).id

    def close(entry_id):
        with Session(engine) as db:
            def coordinate_update(state):
                if state.is_update:
                    exit_ready.wait()

            event.listen(db, "do_orm_execute", coordinate_update)
            return close_manual_entry(db, entry_id).time_out

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(create)
            second = pool.submit(create)
            entry_id = first.result()
            assert second.result() == entry_id
            exits = list(pool.map(close, [entry_id, entry_id]))

        with Session(engine) as db:
            assert db.query(EntryLog).count() == 1
            assert exits[0] == exits[1] == db.get(EntryLog, entry_id).time_out
    finally:
        engine.dispose()
