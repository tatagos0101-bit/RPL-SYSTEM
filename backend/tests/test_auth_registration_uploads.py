from io import BytesIO

from models.user import User
from routers.auth import _hash
from routers.users import PRIVACY_POLICY_VERSION


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
FAKE_JPG_BYTES = b"not really an image"


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


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response


def test_login_sets_http_only_cookie_and_profile_accepts_cookie_auth(client, db_session):
    user = User(
        name="Member",
        email="member@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-MEM01",
    )
    db_session.add(user)
    db_session.commit()

    login_response = login(client, user.email)

    assert "access_token" in login_response.json()
    assert login_response.json()["must_change_password"] is False
    assert "rpl_auth=" in login_response.headers["set-cookie"]
    assert "HttpOnly" in login_response.headers["set-cookie"]
    assert client.get("/api/user/profile").status_code == 200


def test_librarian_registration_uses_random_temp_password_and_requires_change(client, db_session, checked_photo_id):
    librarian = create_librarian(db_session)
    token = login(client, librarian.email).json()["access_token"]

    fields, files = checked_photo_id(client)
    first = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "First Member", "email": "first@example.com", "location": "Rizal", **fields},
        files=files,
    )
    fields, files = checked_photo_id(client)
    second = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "Second Member", "email": "second@example.com", "location": "Rizal", **fields},
        files=files,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["temporary_password"] != second.json()["temporary_password"]
    assert "default_password" not in first.json()

    login_response = login(client, "first@example.com", first.json()["temporary_password"])
    assert login_response.json()["must_change_password"] is True
    assert login_response.json()["requires_privacy_consent"] is True
    assert client.get("/api/auth/session").json()["requires_privacy_consent"] is True
    assert client.get("/api/user/profile").json()["requires_privacy_consent"] is True

    member = db_session.get(User, first.json()["id"])
    new_password = {"new_password": "Replacement1"}
    for payload in (new_password, {**new_password, "accept_privacy_policy": False},
                    {**new_password, "accept_privacy_policy": "true"}):
        result = client.put("/api/user/change-password", json=payload)
        assert result.status_code == 422
        assert "set-cookie" not in result.headers
        assert client.get("/api/user/notifications").status_code == 403
        db_session.refresh(member)
        assert member.privacy_policy_version is None and member.privacy_policy_accepted_at is None

    accepted = {**new_password, "accept_privacy_policy": True}
    for payload in (accepted, {**accepted, "privacy_policy_version": "2026-11-23"}):
        result = client.put("/api/user/change-password", json=payload)
        assert result.status_code == 409
        assert "set-cookie" not in result.headers
    changed = client.put("/api/user/change-password", json={**accepted, "privacy_policy_version": PRIVACY_POLICY_VERSION})
    assert changed.status_code == 200
    assert changed.json()["requires_privacy_consent"] is False
    assert changed.json()["must_change_password"] is False
    assert client.get("/api/user/notifications").status_code == 200
    old_token = login_response.json()["access_token"]
    assert client.get("/api/auth/session", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    db_session.refresh(member)
    assert member.privacy_policy_version == PRIVACY_POLICY_VERSION
    assert member.privacy_policy_accepted_at is not None
    assert member.face_consent_at is None


def test_librarian_registration_rejects_extension_spoofed_upload(client, db_session):
    librarian = create_librarian(db_session)
    token = login(client, librarian.email).json()["access_token"]

    response = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "Bad Upload", "email": "bad@example.com", "location": "Rizal", "identity_checked": "true", "member_agreed_terms": "true", "terms_version": "2026-11-26"},
        files={"id_image": ("id.jpg", BytesIO(FAKE_JPG_BYTES), "image/jpeg")},
    )

    assert response.status_code == 400
    assert "valid JPG, PNG, or WEBP" in response.json()["detail"]


def test_registration_requires_current_terms_and_keeps_an_issuance_receipt(client, db_session, checked_photo_id):
    from models.member_application import MemberApplication
    from schemas.library_workflows import TERMS_VERSION
    staff = create_librarian(db_session)
    login(client, staff.email)
    fields, files = checked_photo_id(client)
    fields.update(name="Synthetic Terms Member", location="Synthetic Town")
    count = db_session.query(User).count()
    for accepted in (None, "false"):
        payload = {key: value for key, value in fields.items() if key != "member_agreed_terms"}
        if accepted is not None:
            payload["member_agreed_terms"] = accepted
        response = client.post("/api/librarian/users/register", data=payload, files=files)
        assert response.status_code == 422
        assert db_session.query(User).count() == count
    response = client.post("/api/librarian/users/register", data={**fields, "terms_version": "old"}, files=files)
    assert response.status_code == 409 and db_session.query(User).count() == count
    created = client.post("/api/librarian/users/register", data=fields, files=files)
    assert created.status_code == 201, created.text
    receipt = db_session.query(MemberApplication).filter_by(receipt=created.json()["registration_receipt"]).one()
    assert receipt.status == "approved" and receipt.member_user_id == created.json()["id"]
    assert receipt.terms_version == TERMS_VERSION and receipt.reviewed_by_id == staff.id
    assert "agreed" in receipt.review_notes
    assert db_session.get(User, receipt.member_user_id).privacy_policy_accepted_at is None


def test_avatar_upload_rejects_extension_spoofed_upload(client, db_session):
    user = User(
        name="Member",
        email="member@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-MEM01",
    )
    db_session.add(user)
    db_session.commit()
    token = login(client, user.email).json()["access_token"]

    response = client.post(
        "/api/user/avatar",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("avatar.png", BytesIO(FAKE_JPG_BYTES), "image/png")},
    )

    assert response.status_code == 400
    assert "valid JPG, PNG, or WEBP" in response.json()["detail"]
