from io import BytesIO

from models.user import User
from routers.auth import _hash


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


def test_librarian_registration_uses_random_temp_password_and_requires_change(client, db_session):
    librarian = create_librarian(db_session)
    token = login(client, librarian.email).json()["access_token"]

    first = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "First Member", "email": "first@example.test", "location": "Rizal"},
        files={"id_image": ("id.png", BytesIO(PNG_BYTES), "image/png")},
    )
    second = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "Second Member", "email": "second@example.test", "location": "Rizal"},
        files={"id_image": ("id.png", BytesIO(PNG_BYTES), "image/png")},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["temporary_password"] != second.json()["temporary_password"]
    assert "default_password" not in first.json()

    login_response = login(client, "first@example.test", first.json()["temporary_password"])
    assert login_response.json()["must_change_password"] is True


def test_librarian_registration_rejects_extension_spoofed_upload(client, db_session):
    librarian = create_librarian(db_session)
    token = login(client, librarian.email).json()["access_token"]

    response = client.post(
        "/api/librarian/users/register",
        headers={"Authorization": f"Bearer {token}"},
        data={"name": "Bad Upload", "email": "bad@example.test", "location": "Rizal"},
        files={"id_image": ("id.jpg", BytesIO(FAKE_JPG_BYTES), "image/jpeg")},
    )

    assert response.status_code == 400
    assert "valid JPG, PNG, WEBP, or PDF" in response.json()["detail"]


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
