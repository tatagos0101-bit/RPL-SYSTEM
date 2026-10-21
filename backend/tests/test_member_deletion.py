from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from models.auth_session import AuthSession
from models.book import Book
from models.entry_log import EntryLog
from models.face_embedding import FaceEmbedding
from models.notification import Notification
from models.reservation import Reservation
from models.security_alert import SecurityAlert
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash, _make_token
from services import storage_service
from timezone_utils import now_ph


@pytest.fixture()
def accounts(db_session):
    staff = User(name="Synthetic staff", role="librarian", password_hash=_hash("Password1"))
    member = User(name="Synthetic member", role="member", email="member@example.test",
                  member_id="RPL-TEST1", phone="123", location="Synthetic location",
                  password_hash=_hash("Password1"), face_encoding="[0.1, 0.2]")
    other = User(name="Other synthetic member", role="member", password_hash=_hash("Password1"))
    db_session.add_all([staff, member, other])
    db_session.commit()
    tokens = [_make_token(user.id, db_session) for user in (staff, member, other)]
    db_session.commit()
    return staff, member, other, [{"Authorization": "Bearer " + token} for token in tokens]


def remove(client, user_id, headers, kind="account", password="Password1"):
    path = f"/api/librarian/users/{user_id}" + ("/face" if kind == "face" else "")
    return client.request("DELETE", path, headers=headers, json={"current_password": password})


@pytest.mark.parametrize("kind", ["account", "face"])
def test_deletion_access_and_password_checks(client, db_session, accounts, kind):
    staff, member, other, headers = accounts
    assert remove(client, member.id, {}, kind).status_code == 401
    assert remove(client, other.id, headers[1], kind).status_code == 403
    assert remove(client, member.id, headers[0], kind, "incorrect").status_code == 403
    assert remove(client, staff.id, headers[0], kind).status_code == 404
    staff.status = "suspended"
    db_session.commit()
    assert remove(client, member.id, headers[0], kind).status_code == 401
    db_session.refresh(member)
    assert member.face_encoding and member.deleted_at is None


def test_face_deletion_removes_all_templates_snapshots_and_sessions(client, db_session, accounts):
    _, member, other, headers = accounts
    for active in (False, True):
        db_session.add(FaceEmbedding(user_id=member.id, engine="insightface", dimension=2,
                                    embedding="[0.1, 0.2]", is_active=active))
    db_session.add(FaceEmbedding(user_id=other.id, engine="dlib", dimension=2, embedding="[0.9, 0.9]"))
    alert = SecurityAlert(user_id=member.id, alert_type="SPOOF_ENROLL", snapshot_b64="synthetic")
    db_session.add(alert)
    db_session.commit()
    assert remove(client, member.id, headers[0], "face").status_code == 204
    db_session.expire_all()
    assert member.face_encoding is None and member.deleted_at is None
    assert member.email == "member@example.test" and member.status == "active"
    assert db_session.query(FaceEmbedding).filter_by(user_id=member.id).count() == 0
    assert db_session.query(FaceEmbedding).filter_by(user_id=other.id).count() == 1
    assert alert.snapshot_b64 is None
    assert client.get("/api/user/profile", headers=headers[1]).status_code == 401
    assert remove(client, member.id, headers[0], "face").status_code == 204
    assert client.post("/api/auth/login", json={"email": member.email, "password": "Password1"}).status_code == 200


@pytest.mark.parametrize("status", ["active", "overdue"])
def test_outstanding_books_block_account_deletion_before_files_change(client, db_session, accounts, monkeypatch, status):
    _, member, _, headers = accounts
    book = Book(title="Synthetic book", author="Synthetic", category="General", copies_total=1, copies_available=0)
    db_session.add(book); db_session.flush()
    db_session.add(Transaction(user_id=member.id, book_id=book.id, type="borrow", status=status))
    db_session.commit()
    calls = []
    monkeypatch.setattr(storage_service, "delete_upload", lambda *a, **kw: calls.append(kw))
    assert remove(client, member.id, headers[0]).status_code == 409
    db_session.refresh(member)
    assert member.deleted_at is None and member.face_encoding
    assert calls == []


def test_account_deletion_preserves_history_cancels_holds_and_cannot_reactivate(client, db_session, accounts):
    _, member, other, headers = accounts
    member.avatar_url = "/uploads/avatars/member.png"
    member.id_image_url = "/uploads/ids/member.png"
    Path("uploads/avatars/member.png").write_bytes(b"synthetic")
    Path("uploads/ids/member.png").write_bytes(b"synthetic")
    book = Book(title="Synthetic book", author="Synthetic", category="General", copies_total=1, copies_available=1)
    db_session.add(book); db_session.flush()
    when = now_ph() - timedelta(days=2)
    loan = Transaction(user_id=member.id, book_id=book.id, type="return", status="returned",
                       borrow_date=when, return_date=now_ph())
    visit = EntryLog(user_id=member.id, entry_type="face_scan", granted=True,
                     accessed_at=when, time_out=now_ph(), note=member.name)
    hold = Reservation(user_id=member.id, book_id=book.id, status="ready", expires_at=now_ph()+timedelta(days=1))
    queued = Reservation(user_id=other.id, book_id=book.id, status="pending", reserved_at=when)
    db_session.add_all([loan, visit, hold, queued]); db_session.flush()
    db_session.add(Notification(message="Synthetic member reserved", member_name=member.name, reservation_id=hold.id))
    db_session.add(Notification(message="Synthetic member report", member_name=member.name, type="report"))
    db_session.commit()
    loan_id, visit_id, member_id = loan.id, visit.id, member.id
    response = remove(client, member_id, headers[0])
    assert response.status_code == 204, response.text
    db_session.expire_all()
    assert member.deleted_at and member.status == "suspended" and member.name == "Deleted member"
    for attr in ("email", "phone", "location", "member_id", "face_encoding", "avatar_url", "id_image_url"):
        assert getattr(member, attr) is None
    assert not Path("uploads/avatars/member.png").exists() and not Path("uploads/ids/member.png").exists()
    assert db_session.get(Transaction, loan_id).status == "returned"
    assert db_session.get(EntryLog, visit_id).note is None
    assert loan.borrow_date.replace(tzinfo=None) == when.replace(tzinfo=None)
    assert hold.status == "cancelled" and queued.status == "ready" and book.copies_available == 1
    assert db_session.query(Notification).filter_by(member_name="Synthetic member").count() == 0
    assert db_session.query(AuthSession).filter_by(user_id=member_id).count() == 0
    assert client.get("/api/user/profile", headers=headers[1]).status_code == 401
    assert client.get("/api/librarian/users/count", headers=headers[0]).json()["total"] == 1
    assert client.get("/api/librarian/users/stats", headers=headers[0]).json()["total"] == 1
    assert client.put(f"/api/librarian/users/{member_id}/status", headers=headers[0], json={"status":"active"}).status_code == 404
    assert client.post(f"/api/librarian/users/{member_id}/reset-password", headers=headers[0]).status_code == 404
    assert client.post(f"/api/librarian/users/{member_id}/enroll-face", headers=headers[0], json={"image":"synthetic"}).status_code == 404
    assert remove(client, member_id, headers[0]).status_code == 204


def test_storage_failure_is_not_reported_as_deletion_and_can_retry(client, db_session, accounts, monkeypatch):
    _, member, _, headers = accounts
    member.avatar_url = "/uploads/avatars/member.png"
    member.id_image_url = "/uploads/ids/member.png"
    db_session.commit()
    calls = []
    def fail(reference, *, folder):
        calls.append(folder)
        if folder == "ids":
            raise HTTPException(502, "synthetic")
    monkeypatch.setattr(storage_service, "delete_upload", fail)
    assert remove(client, member.id, headers[0]).status_code == 502
    db_session.refresh(member)
    assert member.deleted_at is None and member.id_image_url and member.avatar_url
    assert calls == ["avatars", "ids"]
    monkeypatch.setattr(storage_service, "delete_upload", lambda *a, **kw: None)
    assert remove(client, member.id, headers[0]).status_code == 204


def test_ambiguous_legacy_notice_requires_review(client, db_session, accounts):
    _, member, other, headers = accounts
    other.name = member.name
    db_session.add(Notification(message="Synthetic", member_name=member.name, type="report"))
    db_session.commit()
    assert remove(client, member.id, headers[0]).status_code == 409
    db_session.refresh(member)
    assert member.deleted_at is None


def test_old_match_cannot_restore_a_deleted_face(db_session, accounts, monkeypatch):
    from services import face_engine_service as faces
    from services.member_deletion import delete_face_data
    _, member, _, _ = accounts
    stale_match = faces.FaceMatch(user=member, score=0, engine="dlib")
    delete_face_data(db_session, member)
    db_session.commit()
    monkeypatch.setattr(faces, "find_best_match", lambda *a, **kw: stale_match)
    face = {"engine": "dlib", "encoding": [0.1, 0.2]}
    assert faces.find_match_for_face(db_session, face) is None
    # Simulate an InsightFace fallback that found the legacy face before removal.
    monkeypatch.setattr(faces, "find_best_match",
                        lambda db, enc, engine, **kw: stale_match if engine == "dlib" else None)
    monkeypatch.setattr(faces, "FACE_AUTO_UPGRADE_EMBEDDINGS", True)
    assert faces.find_match_for_face(db_session, {
        "engine": "insightface", "encoding": [0.4, 0.5], "dlib_encoding": [0.1, 0.2],
    }) is None
    assert db_session.query(FaceEmbedding).filter_by(user_id=member.id).count() == 0


def test_replacement_does_not_leave_old_engine_templates(db_session, accounts):
    from services.face_engine_service import store_enrollment_face
    _, member, _, _ = accounts
    db_session.add(FaceEmbedding(user_id=member.id, engine="insightface", dimension=2, embedding="[0.9, 0.9]"))
    db_session.commit()
    store_enrollment_face(db_session, member, {"engine": "dlib", "encoding": [0.3, 0.4]})
    db_session.commit()
    assert member.face_encoding == "[0.3, 0.4]"
    assert db_session.query(FaceEmbedding).filter_by(user_id=member.id).count() == 0


def test_shared_private_file_is_not_deleted(client, db_session, accounts, monkeypatch):
    _, member, other, headers = accounts
    member.id_image_url = other.id_image_url = "/uploads/ids/shared.png"
    db_session.commit()
    calls = []
    monkeypatch.setattr(storage_service, "delete_upload", lambda *a, **kw: calls.append(kw))
    assert remove(client, member.id, headers[0]).status_code == 409
    assert calls == []


def test_identity_write_rechecks_session_after_face_deletion(db_session, accounts):
    from starlette.requests import Request
    from dependencies import get_locked_session_user
    from services.member_deletion import delete_face_data
    _, member, _, headers = accounts
    token = headers[1]["Authorization"].removeprefix("Bearer ")
    delete_face_data(db_session, member)
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        get_locked_session_user(Request({"type": "http", "headers": []}), member, token, db_session)
    assert error.value.status_code == 401
