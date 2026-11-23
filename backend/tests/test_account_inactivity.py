from datetime import datetime, timedelta, timezone
import hashlib

import pytest
from fastapi import HTTPException
from sqlalchemy import inspect, text

from models.account_deletion_notice import AccountDeletionNotice
from models.book import Book
from models.user import User
from models.notification import Notification
from models.entry_log import EntryLog
from models.library_settings import LibrarySetting
from models.reservation import Reservation
from models.transaction import Transaction
from routers.auth import _hash, _make_token
from services import account_inactivity as policy
from services import otp_delivery
from services.entry_session_policy import record_entry_scan
from timezone_utils import PH_TZ, as_ph, now_ph


def test_calendar_month_clamps_and_converts_utc():
    instant = datetime(2024, 8, 30, 16, tzinfo=timezone.utc)
    assert policy.cutoff(instant) == datetime(2024, 2, 29, tzinfo=PH_TZ)


def test_create_once_and_replayed_keep(db_session):
    db = db_session
    member = User(name="Synthetic", password_hash="unused", created_at=now_ph()-timedelta(days=250))
    db.add(member)
    db.commit()
    notice = policy.create(db, member.id)
    assert policy.create(db, member.id).id == notice.id
    assert db.query(Notification).count() == 1
    assert notice.delivery_status == "in_app"
    policy.reply(db, notice.id, member.id)
    first = member.last_activity_at
    policy.reply(db, notice.id, member.id)
    assert member.last_activity_at == first
    assert notice.status == "cancelled"


def inactive(db, **fields):
    member = User(name="Synthetic Member", password_hash="unused", created_at=now_ph()-timedelta(days=300), **fields)
    db.add(member)
    db.commit()
    return member


@pytest.mark.parametrize("failure,expected", [(None, "accepted"), (otp_delivery.DeliveryUnavailable(), "failed"),
    (otp_delivery.DeliveryUncertain(), "unknown"), (TimeoutError(), "unknown")])
def test_transport_claim_is_committed_before_io(db_session, monkeypatch, failure, expected):
    member = inactive(db_session, email="synthetic@example.test")
    notice = policy.create(db_session, member.id)
    calls = []
    monkeypatch.setattr(otp_delivery, "configured", lambda _: True)

    def transport(*args, **kwargs):
        from sqlalchemy.orm import Session
        with Session(engine) as separate:
            assert separate.get(AccountDeletionNotice, notice_id).delivery_status == "unknown"
        calls.append(kwargs)
        if failure:
            raise failure

    engine = db_session.get_bind()
    notice_id = notice.id
    monkeypatch.setattr(otp_delivery, "send_email", transport)
    policy.deliver(db_session, notice_id)
    policy.deliver(db_session, notice_id)
    assert len(calls) == 1 and calls[0]["max_attempts"] == 1
    assert notice.delivery_status == expected


def test_maturity_and_stale_approval(db_session, monkeypatch):
    member = inactive(db_session)
    notice = policy.create(db_session, member.id)
    deadline = as_ph(notice.respond_by)
    monkeypatch.setattr(policy, "now_ph", lambda: deadline-timedelta(microseconds=1))
    with pytest.raises(HTTPException) as premature:
        policy.approve(db_session, notice.id)
    assert premature.value.status_code == 409
    monkeypatch.setattr(policy, "now_ph", lambda: deadline)
    assert policy.view(db_session, notice)["status"] == "ready_for_review"
    member.last_activity_at = as_ph(notice.last_activity_at) + timedelta(seconds=1)
    db_session.commit()
    with pytest.raises(HTTPException) as stale:
        policy.approve(db_session, notice.id)
    assert stale.value.status_code == 409
    assert notice.status == "cancelled" and member.deleted_at is None


def test_station_exit_and_history(db_session):
    db = db_session
    member = inactive(db)
    original = as_ph(member.created_at)
    db.add_all([EntryLog(user_id=member.id, granted=False, accessed_at=now_ph()),
                EntryLog(visitor_name=member.name, granted=True, accessed_at=now_ph())])
    db.commit()
    assert policy.latest_activity(db, member) == original
    book = Book(title="Synthetic", author="Synthetic", category="General")
    db.add(book)
    db.flush()
    loan = Transaction(user_id=member.id, book_id=book.id, type="return", status="returned",
                       borrow_date=original+timedelta(days=10), return_date=original+timedelta(days=12))
    db.add(loan)
    db.commit()
    assert policy.latest_activity(db, member) == as_ph(loan.return_date)
    reserved = original+timedelta(days=20)
    db.add(Reservation(user_id=member.id, book_id=book.id, reserved_at=reserved, status="cancelled"))
    db.commit()
    assert policy.latest_activity(db, member) == reserved
    entered = now_ph()-timedelta(minutes=20)
    record_entry_scan(db, member, seen_at=entered)
    exited = entered+timedelta(minutes=10)
    record_entry_scan(db, member, seen_at=exited, distinct_encounter=True)
    db.commit()
    assert as_ph(member.last_activity_at) == exited
    _make_token(member.id, db)
    db.commit()
    assert as_ph(member.last_activity_at) > exited


def test_job_auth_batch_and_no_deletion(client, db_session):
    key = "synthetic-dedicated-job-key"
    url = "/api/internal/account-inactivity/check"
    headers = {"Authorization": "Bearer " + key}
    assert client.post(url, headers=headers).status_code == 401
    db_session.add(LibrarySetting(key="account_inactivity_job_digest", value=hashlib.sha256(key.encode()).hexdigest()))
    for i in range(4):
        inactive(db_session, email=f"synthetic{i}@example.test")
    for invalid in ("", "Bearer ", "Bearer wrong", "Basic " + key, "Bearer " + "a"*257):
        assert client.post(url, headers={"Authorization": invalid}).status_code == 401
    assert client.post(url, headers=headers, json={"dry_run": True}).status_code == 200
    assert db_session.query(Notification).count() == 0
    result = client.post(url, headers=headers)
    assert result.json() == {"created": 3, "processed": 3}
    assert db_session.query(AccountDeletionNotice).filter_by(delivery_status="unavailable").count() == 3
    db_session.query(AccountDeletionNotice).update({"respond_by": now_ph()-timedelta(hours=1)})
    db_session.commit()
    assert client.post(url, headers=headers).json()["created"] == 1
    assert db_session.query(User).filter(User.deleted_at.is_not(None)).count() == 0


def test_role_ownership_password_manual_and_mature_deletion(client, db_session):
    db = db_session
    staff = User(name="Staff", role="librarian", password_hash=_hash("Password1"))
    db.add(staff)
    member = inactive(db)
    other = inactive(db)
    def auth(user):
        value = _make_token(user.id, db)
        db.commit()
        return {"Authorization": "Bearer " + value}
    staff_headers, other_headers = auth(staff), auth(other)
    url = f"/api/librarian/member/{member.id}/account-notice"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=other_headers).status_code == 403
    assert client.get("/api/user/account-notice", headers=staff_headers).status_code == 403
    assert client.post(url, headers=staff_headers, json={"current_password":"wrong"}).status_code == 403
    body = {"current_password":"Password1"}
    notice = client.post(url, headers=staff_headers, json=body).json()
    nid = notice["id"]
    assert client.get("/api/librarian/account-notices?status=pending", headers=staff_headers).json()["total"] == 1
    assert client.post(f"/api/user/account-notices/{nid}/keep", headers=other_headers).status_code == 404
    other.status = "suspended"
    db.commit()
    assert client.get("/api/user/account-notice", headers=other_headers).status_code in (401,403)
    approve_url = f"/api/librarian/account-notices/{nid}/approve"
    assert client.post(approve_url, headers=staff_headers, json=body).status_code == 409
    assert client.request("DELETE", f"/api/librarian/users/{member.id}", headers=staff_headers, json=body).status_code == 204
    db.expire_all()
    closed = db.get(AccountDeletionNotice, nid)
    assert closed.status == "deleted" and closed.notification_id is None
    mature = inactive(db)
    eligible = policy.create(db, mature.id)
    eligible.respond_by = now_ph()
    db.commit()
    assert client.post(f"/api/librarian/account-notices/{eligible.id}/approve",
                       headers=staff_headers, json=body).json() == {"status": "deleted"}


def test_repeatable_additive_upgrade_keeps_existing_member(db_session):
    engine = db_session.get_bind()
    from database import Base
    from services.schema_migrations import upgrade_schema
    member = inactive(db_session)
    member_id = member.id
    db_session.close()
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE account_deletion_notices"))
        conn.execute(text("ALTER TABLE users DROP COLUMN last_activity_at"))
        for _ in range(2):
            Base.metadata.create_all(conn)
            upgrade_schema(conn, Base.metadata)
        assert conn.execute(text("SELECT last_activity_at FROM users WHERE id=:id"), {"id": member_id}).one() == (None,)
        fk = next(f for f in inspect(conn).get_foreign_keys("account_deletion_notices")
                  if f["constrained_columns"] == ["notification_id"])
        assert fk["options"]["ondelete"] == "SET NULL"



def test_old_reply_cannot_renew_or_close_newer_notice(db_session):
    db = db_session
    member = inactive(db)
    old = policy.create(db, member.id)
    policy.reply(db, old.id, member.id)
    # Simulate the next six-month cycle with a previously recorded reply.
    member.last_activity_at = now_ph() - timedelta(days=220)
    db.commit()
    new = policy.create(db, member.id)
    before = member.last_activity_at
    policy.reply(db, old.id, member.id)
    assert new.status == "pending" and member.last_activity_at == before


def test_outstanding_loan_blocks_mature_approval_and_new_notice(db_session):
    db = db_session
    member = inactive(db)
    notice = policy.create(db, member.id)
    notice.respond_by = now_ph()
    book = Book(title="Synthetic", author="Synthetic", category="General")
    db.add(book)
    db.flush()
    # Legacy outstanding book predates the activity snapshot.
    db.add(Transaction(user_id=member.id, book_id=book.id, type="borrow", status="active",
                       borrow_date=member.created_at - timedelta(days=1)))
    db.commit()
    with pytest.raises(HTTPException) as blocked:
        policy.approve(db, notice.id)
    assert blocked.value.status_code == 409
    assert member.deleted_at is None
    notice.status = "cancelled"
    db.commit()
    with pytest.raises(HTTPException) as ineligible:
        policy.create(db, member.id)
    assert ineligible.value.status_code == 409


def test_phone_only_member_receives_in_app_notice_without_external_delivery(db_session, monkeypatch):
    member = inactive(db_session, phone="+639000000000")
    notice = policy.create(db_session, member.id)
    assert notice.delivery_channel == "in_app"
    assert notice.delivery_status == "in_app" and notice.notification_id
    calls = []
    monkeypatch.setattr(policy, "send_once", lambda *a, **kw: calls.append(a))
    policy.deliver(db_session, notice.id)
    assert calls == []


def test_legacy_pending_sms_notice_falls_back_to_inbox_without_sending(db_session, monkeypatch):
    member = inactive(db_session, phone="+639000000000")
    notice = policy.create(db_session, member.id)
    notice.delivery_channel = "sms"
    notice.delivery_status = "pending"
    db_session.commit()
    calls = []
    monkeypatch.setattr(policy, "send_once", lambda *a, **kw: calls.append(a))
    policy.deliver(db_session, notice.id)
    assert notice.delivery_channel == "in_app" and notice.delivery_status == "in_app"
    assert notice.notification_id and calls == []
    assert policy.transport("sms", member.phone, "Synthetic notice") == "unavailable"


def test_job_reconciles_stale_reservation_without_deleting(db_session):
    db = db_session
    member = inactive(db)
    notice = policy.create(db, member.id)
    book = Book(title="Synthetic", author="Synthetic", category="General")
    db.add(book)
    db.flush()
    db.add(Reservation(user_id=member.id, book_id=book.id, reserved_at=now_ph()))
    db.commit()
    assert policy.view(db, notice)["status"] == "cancelled"
    policy.check(db)
    assert notice.status == "cancelled" and member.deleted_at is None



def test_exact_cutoff_eligible_and_just_after_rejected(db_session, monkeypatch):
    now = datetime(2024, 8, 31, 9, 30, tzinfo=PH_TZ)
    monkeypatch.setattr(policy, "now_ph", lambda: now)
    for delta in (timedelta(microseconds=1), timedelta()):
        member = User(name="Boundary", password_hash="unused", created_at=policy.cutoff(now) + delta)
        db_session.add(member)
        db_session.commit()
        if delta:
            with pytest.raises(HTTPException) as active:
                policy.create(db_session, member.id)
            assert active.value.status_code == 409
        else:
            notice = policy.create(db_session, member.id)
            assert as_ph(notice.respond_by) == now + timedelta(hours=72)


def test_staff_reply_and_owner_inbox(client, db_session):
    db = db_session
    staff = User(name="Synthetic staff", role="librarian", password_hash="unused")
    db.add(staff)
    member = inactive(db)
    notice = policy.create(db, member.id)
    staff_headers = {"Authorization": "Bearer " + _make_token(staff.id, db)}
    db.commit()
    path = f"/api/librarian/account-notices/{notice.id}/record-reply"
    assert client.post(path, headers=staff_headers, json={}).json()["status"] == "cancelled"
    db.refresh(member)
    first = member.last_activity_at
    assert client.post(path, headers=staff_headers, json={}).status_code == 200
    db.refresh(member)
    assert member.last_activity_at == first
    own_headers = {"Authorization": "Bearer " + _make_token(member.id, db)}
    db.commit()
    mine = client.get("/api/user/account-notice", headers=own_headers).json()["notice"]
    assert mine["id"] == notice.id and mine["notification_id"] == notice.notification_id
    assert client.post(f"/api/user/account-notices/{notice.id}/keep", headers=own_headers, json={}).status_code == 200



def test_committing_keep_wins_against_approval_on_separate_sqlite_connections(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from database import Base

    engine = create_engine(f"sqlite:///{tmp_path / 'notice-race.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as seed:
        member = inactive(seed)
        notice = policy.create(seed, member.id)
        notice.respond_by = now_ph() - timedelta(seconds=1)
        seed.commit()
        member_id, notice_id = member.id, notice.id

    keep_written, approval_connected, approval_validated = Event(), Event(), Event()
    actual_delete = policy.delete_account

    def observe_delete(db, member):
        approval_validated.set()
        return actual_delete(db, member)

    monkeypatch.setattr(policy, "delete_account", observe_delete)

    def respond():
        with Session(engine) as db:
            commit = db.commit
            def finish():
                db.flush()
                keep_written.set()
                assert approval_connected.wait(5)
                approval_validated.wait(0.5)
                commit()
            db.commit = finish
            policy.reply(db, notice_id, member_id)

    def approve():
        with Session(engine) as db:
            db.connection()
            approval_connected.set()
            try:
                policy.approve(db, notice_id)
            except HTTPException as exc:
                return exc.status_code
            return 200

    with ThreadPoolExecutor(2) as workers:
        keep = workers.submit(respond)
        assert keep_written.wait(5)
        approval = workers.submit(approve)
        keep.result(timeout=10)
        assert approval.result(timeout=10) == 409
    with Session(engine) as db:
        assert db.get(User, member_id).deleted_at is None
        assert db.get(AccountDeletionNotice, notice_id).status == "cancelled"
    engine.dispose()


def test_dry_run_typo_cannot_create_notice(client, db_session):
    key = "synthetic-dry-run-secret"
    inactive(db_session)
    db_session.add(LibrarySetting(key="account_inactivity_job_digest", value=hashlib.sha256(key.encode()).hexdigest()))
    db_session.commit()
    response = client.post("/api/internal/account-inactivity/check", headers={"Authorization":"Bearer "+key},
                           json={"dryRun": True})
    assert response.status_code == 422
    assert db_session.query(AccountDeletionNotice).count() == db_session.query(Notification).count() == 0


def test_unknown_creation_and_history(client, db_session):
    db = db_session
    member = inactive(db)
    staff = User(name="Synthetic staff", role="librarian", password_hash="unused")
    db.add(staff)
    db.flush()
    token = _make_token(staff.id, db)
    db.execute(text("UPDATE users SET created_at = NULL WHERE id = :id"), {"id": member.id})
    db.commit()
    url = f"/api/librarian/member/{member.id}/account-notice"
    review = client.get(url, headers={"Authorization":"Bearer "+token}).json()
    assert review["last_activity_at"] is None and review["inactive_days"] is None and not review["eligible"]
    assert policy.check(db)["created"] == 0
    db.add(EntryLog(user_id=member.id, accessed_at=now_ph()-timedelta(days=300), granted=True))
    db.commit()
    assert policy.check(db)["created"] == 1


def test_job_deadline_includes_slow_authentication(client, db_session, monkeypatch):
    from sqlalchemy.orm import Session
    key = "synthetic-job-for-time-budget"
    inactive(db_session)
    db_session.add(LibrarySetting(key="account_inactivity_job_digest", value=hashlib.sha256(key.encode()).hexdigest()))
    db_session.commit()
    elapsed = [0]
    monkeypatch.setattr(policy, "monotonic", lambda: elapsed[0])
    original = Session.get
    def slow_lookup(session, model, *args, **kwargs):
        value = original(session, model, *args, **kwargs)
        if model is LibrarySetting:
            elapsed[0] = 46
        return value
    monkeypatch.setattr(Session, "get", slow_lookup)
    response = client.post("/api/internal/account-inactivity/check", headers={"Authorization":"Bearer "+key})
    assert response.status_code == 503
    assert db_session.query(AccountDeletionNotice).count() == 0


def test_late_candidate_query_does_not_start_transport(db_session, monkeypatch):
    from sqlalchemy import event
    db = db_session
    inactive(db, email="synthetic@example.test")
    elapsed, calls = [0], []
    monkeypatch.setattr(policy, "monotonic", lambda: elapsed[0])
    monkeypatch.setattr(otp_delivery, "configured", lambda _: True)
    monkeypatch.setattr(otp_delivery, "send_email", lambda *a, **kw: calls.append(1))
    def delay(conn, cursor, statement, parameters, context, many):
        if "ORDER BY users.id" in statement:
            elapsed[0] = 44
    event.listen(db.get_bind(), "after_cursor_execute", delay)
    try:
        policy.check(db)
    finally:
        event.remove(db.get_bind(), "after_cursor_execute", delay)
    assert calls == []
    assert db.query(AccountDeletionNotice).count() == 0



def test_expired_committed_claim_never_sends_or_retries(db_session, monkeypatch):
    from sqlalchemy import event
    db = db_session
    member = inactive(db, email="synthetic@example.test")
    notice = policy.create(db, member.id)
    elapsed, calls = [0], []
    monkeypatch.setattr(policy, "monotonic", lambda: elapsed[0])
    monkeypatch.setattr(otp_delivery, "configured", lambda _: True)
    monkeypatch.setattr(otp_delivery, "send_email", lambda *a, **kw: calls.append(1))
    event.listen(db, "after_commit", lambda _: elapsed.__setitem__(0, 44), once=True)
    policy.deliver(db, notice.id, end=45)
    assert notice.delivery_status == "unknown"
    policy.deliver(db, notice.id)
    assert calls == []


def test_connection_budget_checked_before_and_after_checkout(monkeypatch):
    from contextlib import contextmanager
    from types import SimpleNamespace
    elapsed, checkouts = [40], []
    monkeypatch.setattr(policy, "monotonic", lambda: elapsed[0])

    @contextmanager
    def slow_checkout():
        checkouts.append(1)
        elapsed[0] = 46
        yield object()

    engine = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"), connect=slow_checkout)
    db = SimpleNamespace(get_bind=lambda: engine)
    for started, expected_checkouts in [(40, 0), (0, 1)]:
        elapsed[0] = started
        with pytest.raises(HTTPException) as expired:
            with policy.job_session(db, end=45):
                pytest.fail("A connection outside the job budget was used.")
        assert expired.value.status_code == 503
        assert len(checkouts) == expected_checkouts
