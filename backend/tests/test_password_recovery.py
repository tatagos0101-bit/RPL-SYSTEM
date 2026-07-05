from models.user import User
from routers.auth import _hash


def create_member(
    db,
    name="Member",
    email="member@example.test",
    phone="+63 912 345 6789",
    email_verified=True,
    phone_verified=False,
):
    user = User(
        name=name,
        email=email,
        phone=phone,
        email_verified=email_verified,
        phone_verified=phone_verified,
        password_hash=_hash("OldPass1"),
        role="member",
        member_id="RPL-MEM01",
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


def login(client, identifier, password):
    return client.post("/api/auth/login", json={"email": identifier, "password": password})


def test_verified_email_member_can_reset_password_with_code(client, db_session):
    member = create_member(db_session)

    requested = client.post(
        "/api/auth/password-reset/request",
        json={"identifier": member.email, "channel": "email"},
    )

    assert requested.status_code == 200
    body = requested.json()
    assert body["success"] is True
    assert body["delivery_channel"] == "email"
    assert body["requires_librarian_help"] is False
    assert body["debug_code"]

    confirmed = client.post(
        "/api/auth/password-reset/confirm",
        json={
            "identifier": member.email,
            "code": body["debug_code"],
            "new_password": "NewPass1",
        },
    )

    assert confirmed.status_code == 200
    assert confirmed.json()["success"] is True
    assert login(client, member.email, "OldPass1").status_code == 401
    new_login = login(client, member.email, "NewPass1")
    assert new_login.status_code == 200
    assert new_login.json()["must_change_password"] is False


def test_verified_phone_member_can_request_sms_reset_code(client, db_session):
    member = create_member(
        db_session,
        email="phone-member@example.test",
        phone="+63 999 111 2222",
        email_verified=False,
        phone_verified=True,
    )

    requested = client.post(
        "/api/auth/password-reset/request",
        json={"identifier": member.member_id, "channel": "sms"},
    )

    assert requested.status_code == 200
    body = requested.json()
    assert body["success"] is True
    assert body["delivery_channel"] == "sms"
    assert body["debug_code"]


def test_member_without_verified_contact_is_directed_to_librarian(client, db_session):
    member = create_member(
        db_session,
        email=None,
        phone=None,
        email_verified=False,
        phone_verified=False,
    )

    requested = client.post(
        "/api/auth/password-reset/request",
        json={"identifier": member.member_id},
    )

    assert requested.status_code == 200
    body = requested.json()
    assert body["success"] is False
    assert body["delivery_channel"] is None
    assert body["requires_librarian_help"] is True
    assert "librarian" in body["message"].lower()
    assert "debug_code" not in body or body["debug_code"] is None


def test_librarian_can_issue_temporary_password_and_force_change(client, db_session):
    member = create_member(db_session)
    librarian = create_librarian(db_session)
    token = login(client, librarian.email, "Password1").json()["access_token"]

    reset = client.post(
        f"/api/librarian/users/{member.id}/reset-password",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert reset.status_code == 200
    body = reset.json()
    assert body["temporary_password"]
    assert body["member_id"] == member.member_id

    old_login = login(client, member.email, "OldPass1")
    assert old_login.status_code == 401
    temp_login = login(client, member.email, body["temporary_password"])
    assert temp_login.status_code == 200
    assert temp_login.json()["must_change_password"] is True
