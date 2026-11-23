from models.user import User
from routers.auth import _hash


def create_librarian(db):
    user = User(
        name="Lookup Librarian",
        email="lookup-librarian@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_member(db):
    user = User(
        name="Manual Lookup Member",
        email="manual-lookup@example.test",
        member_id="RPL-MANUAL",
        password_hash=_hash("Password1"),
        role="member",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_librarian_member_search_accepts_numeric_user_id(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    token = login(client, librarian.email)

    response = client.get(
        f"/api/librarian/users?search={member.id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [member.id]


def test_member_search_no_longer_uses_legacy_phone_numbers(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    member.phone = "+639123456789"
    db_session.commit()
    token = login(client, librarian.email)
    response = client.get("/api/librarian/users?search=639123456789",
                          headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200 and response.json() == []
