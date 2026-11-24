from models.user import User
from routers.auth import _hash, _make_token
from timezone_utils import now_ph


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


def test_librarian_can_fill_blank_addresses_without_overwriting_actual_locations(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    member.name = "Synthetic de la Cruz"
    sibling = User(name="Dela Cruz, Sibling Synthetic", location="\t \n", password_hash=member.password_hash)
    suspended = User(name="Another De La Cruz Jr.", status="suspended", password_hash=member.password_hash)
    existing = User(name="Existing de la Cruz", location="Synthetic actual address", password_hash=member.password_hash)
    tombstone = User(name="Deleted member", status="suspended", deleted_at=now_ph(), password_hash="!deleted")
    others = [User(name=f"Synthetic Family{n}", password_hash=member.password_hash) for n in range(35)]
    db_session.add_all([sibling, suspended, existing, tombstone, *others])
    db_session.commit()
    staff_headers = {"Authorization": "Bearer " + _make_token(librarian.id, db_session)}
    member_headers = {"Authorization": "Bearer " + _make_token(member.id, db_session)}
    db_session.commit()

    path = "/api/librarian/users/fill-missing-addresses"
    assert client.post(path).status_code == 401
    assert client.post(path, headers=member_headers).status_code == 403
    filled = client.post(path, headers=staff_headers)
    assert filled.status_code == 200 and filled.json() == {"updated": 38}
    assert client.post(path, headers=staff_headers).json() == {"updated": 0}

    rows = {row["id"]: row for row in client.get("/api/librarian/users", headers=staff_headers).json()}
    family = [rows[user.id] for user in (member, sibling, suspended)]
    assert all(row["location_is_generated"] for row in family)
    assert len({row["location"] for row in family}) == 1
    assert rows[existing.id]["location"] == "Synthetic actual address"
    assert rows[existing.id]["location_is_generated"] is False
    generated = {rows[user.id]["location"] for user in others}
    assert len(generated) >= 5
    assert {address.split(", ")[-2] for address in generated} == {"Angono", "Cainta", "Taytay"}
    db_session.expire_all()
    assert librarian.generated_location is None and tombstone.generated_location is None
    assert member.location is None and member.generated_location == family[0]["location"]
    assert sibling.location == "\t \n"
    assert sibling.updated_at is None
    assert client.get("/api/user/profile", headers=member_headers).json()["location"] is None

    new_sibling = User(name="New Synthetic Dela Cruz", password_hash=member.password_hash)
    db_session.add(new_sibling)
    db_session.commit()
    assert client.post(path, headers=staff_headers).json() == {"updated": 1}
    assert new_sibling.generated_location == family[0]["location"]

    blank = client.put("/api/user/profile", headers=member_headers, json={"location": "  "})
    assert blank.status_code == 200 and blank.json()["location"] is None
    db_session.refresh(member)
    assert member.generated_location == family[0]["location"]

    saved = client.put("/api/user/profile", headers=member_headers, json={"location": "Synthetic new address"})
    assert saved.status_code == 200 and saved.json()["location"] == "Synthetic new address"
    db_session.refresh(member)
    assert member.generated_location is None
    assert client.post(path, headers=staff_headers).json() == {"updated": 0}
