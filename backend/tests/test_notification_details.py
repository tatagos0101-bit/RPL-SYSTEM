from datetime import datetime

import pytest

from models.notification import Notification
from models.user import User
from routers.auth import _make_token


@pytest.fixture
def inbox(db_session):
    owner = User(name="Synthetic owner", role="member", password_hash="synthetic")
    other = User(name="Synthetic other", role="member", password_hash="synthetic")
    staff = User(name="Synthetic librarian", role="librarian", password_hash="synthetic")
    db_session.add_all([owner, other, staff])
    db_session.flush()
    personal = Notification(user_id=owner.id, message="Full synthetic message\n" + "Details " * 100,
                            type="reservation_ready", book_title="Synthetic title")
    shared = Notification(message="Synthetic loan issue", type="report", member_name=owner.name,
                          book_title="Synthetic title")
    personal.created_at = shared.created_at = datetime(2026, 11, 20, 12)
    db_session.add_all([personal, shared])
    db_session.commit()
    return owner, other, staff, personal, shared


def auth(user):
    return {"Authorization": f"Bearer {_make_token(user.id)}"}


def test_member_opens_exact_own_notification_without_get_marking_it_read(client, db_session, inbox):
    owner, _, _, personal, _ = inbox
    response = client.get(f"/api/user/notifications/{personal.id}", headers=auth(owner))
    assert response.status_code == 200
    assert response.json()["message"] == personal.message
    assert response.json()["book_title"] == personal.book_title
    assert response.json()["is_read"] is False
    assert response.json()["reservation_id"] is None
    db_session.refresh(personal)
    assert personal.is_read is False


def test_librarian_opens_shared_notification_but_not_member_inbox(client, inbox):
    owner, _, staff, personal, shared = inbox
    headers = auth(staff)
    response = client.get(f"/api/librarian/notifications/{shared.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["member_name"] == owner.name
    assert client.get(f"/api/librarian/notifications/{personal.id}", headers=headers).status_code == 404
    assert client.get(f"/api/user/notifications/{personal.id}", headers=headers).status_code == 403


def test_notification_details_reject_anonymous_wrong_owner_and_wrong_role(client, inbox):
    owner, other, _, personal, shared = inbox
    assert client.get(f"/api/user/notifications/{personal.id}").status_code == 401
    assert client.get(f"/api/librarian/notifications/{shared.id}").status_code == 401
    assert client.get(f"/api/user/notifications/{personal.id}", headers=auth(other)).status_code == 404
    assert client.get(f"/api/user/notifications/{shared.id}", headers=auth(owner)).status_code == 404
    assert client.get(f"/api/librarian/notifications/{shared.id}", headers=auth(owner)).status_code == 403
    assert client.get("/api/user/notifications/999999", headers=auth(owner)).status_code == 404


@pytest.mark.parametrize("role", ["member", "librarian"])
@pytest.mark.parametrize("restricted", ["suspended", "temporary_password"])
def test_notification_details_preserve_account_restrictions(client, db_session, inbox, role, restricted):
    owner, _, staff, personal, shared = inbox
    account, notification, prefix = (owner, personal, "user") if role == "member" else (staff, shared, "librarian")
    headers = auth(account)
    if restricted == "suspended":
        account.status = "suspended"
    else:
        account.must_change_password = True
    db_session.commit()
    response = client.get(f"/api/{prefix}/notifications/{notification.id}", headers=headers)
    assert response.status_code == (401 if restricted == "suspended" else 403)


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_notification_list_paging_has_stable_order_and_keeps_audience_separate(client, db_session, inbox, role):
    owner, _, staff, _, _ = inbox
    account, prefix = (owner, "user") if role == "member" else (staff, "librarian")
    rows = [Notification(user_id=owner.id if role == "member" else None, message=f"Synthetic row {i}",
                         type="reservation", created_at=datetime(2026, 11, 21, 12)) for i in range(5)]
    db_session.add_all(rows)
    db_session.commit()
    ids = sorted([row.id for row in rows], reverse=True)
    headers = auth(account)
    first = client.get(f"/api/{prefix}/notifications?skip=0&limit=2", headers=headers)
    second = client.get(f"/api/{prefix}/notifications?skip=2&limit=2", headers=headers)
    assert first.status_code == second.status_code == 200
    assert [row["id"] for row in first.json()] == ids[:2]
    assert [row["id"] for row in second.json()] == ids[2:4]
    assert client.get(f"/api/{prefix}/notifications?skip=-1", headers=headers).status_code == 422
    assert client.get(f"/api/{prefix}/notifications?limit=201", headers=headers).status_code == 422
