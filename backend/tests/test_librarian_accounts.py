import pytest

from models.library_settings import LibrarySetting
from models.user import User
from routers import librarian_accounts
from services.librarian_accounts import MANAGER_SETTING_KEY, designate_librarian_manager
from services.passwords import hash_password, verify_password


def account(db, email="main@example.com", role="librarian", **extra):
    user = User(name="Synthetic staff", email=email, role=role, status="active",
                password_hash=hash_password("SyntheticPass1"), **extra)
    db.add(user)
    db.commit()
    return user


def login(client, user):
    result = client.post("/api/auth/login", json={"email": user.email, "password": "SyntheticPass1"})
    assert result.status_code == 200


def create(client, **extra):
    return client.post("/api/librarian/staff", json={"name": "New synthetic librarian", "email": "new@example.com",
                       "current_password": "SyntheticPass1", **extra})


@pytest.fixture()
def manager(client, db_session):
    user = account(db_session)
    designate_librarian_manager(db_session, user.id)
    db_session.commit()
    login(client, user)
    return user


def test_anonymous_cannot_list_or_create_staff(client, db_session):
    assert client.get("/api/librarian/staff").status_code == 401
    assert create(client).status_code == 401
    assert db_session.query(User).count() == 0


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_only_designated_main_librarian_can_list_or_create(client, db_session, role):
    main = account(db_session)
    designate_librarian_manager(db_session, main.id)
    other = account(db_session, "other@example.com", role)
    db_session.commit()
    login(client, other)
    assert client.get("/api/librarian/staff").status_code == 403
    assert create(client).status_code == 403
    assert client.get("/api/auth/session").json()["can_manage_librarians"] is False
    assert db_session.query(User).count() == 2


@pytest.mark.parametrize("setting", [None, "", "garbage", "01", "99999"])
def test_missing_or_invalid_designation_never_grants_implicit_access(client, db_session, setting):
    user = account(db_session)
    if setting is not None:
        db_session.add(LibrarySetting(key=MANAGER_SETTING_KEY, value=setting))
        db_session.commit()
    login(client, user)
    assert create(client).status_code == 403
    assert client.get("/api/auth/session").json()["can_manage_librarians"] is False


@pytest.mark.parametrize("restricted,status,deleted,expected", [
    (True, "active", False, 403), (False, "suspended", False, 401), (False, "active", True, 401),
])
def test_current_account_restrictions_are_enforced(client, db_session, manager, restricted, status, deleted, expected):
    from timezone_utils import now_ph
    manager.must_change_password = restricted
    manager.status = status
    if deleted:
        manager.deleted_at = now_ph()
    db_session.commit()
    assert create(client).status_code == expected
    assert client.get("/api/librarian/staff").status_code == expected


def test_staff_creation_hashes_password_enforces_first_change_and_preserves_main_session(client, db_session, manager, monkeypatch):
    sent = []
    def delivery(**values):
        from database import SessionLocal
        with SessionLocal() as other:
            user = other.query(User).filter_by(email="new@example.com").one()
            assert verify_password(values["temporary_password"], user.password_hash)
        sent.append(values)
        return {"channel": "email", "status": "accepted"}
    monkeypatch.setattr(librarian_accounts, "deliver_registration_credentials", delivery)
    response = create(client, email="NEW@Example.com", name="  New synthetic librarian  ")
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert not response.headers.get("set-cookie")
    result = response.json()
    user = db_session.get(User, result["account"]["id"])
    assert user.role == "librarian" and user.email == "new@example.com"
    assert user.name == "New synthetic librarian" and user.must_change_password
    assert not user.email_verified and not user.phone_verified
    assert not result["account"]["is_main_librarian"]
    assert result["temporary_password"] is None
    password = sent[0]["temporary_password"]
    assert len(password) == 14 and any(c.isdigit() for c in password)
    assert password not in response.text and user.password_hash not in response.text
    session = client.get("/api/auth/session").json()
    assert session["id"] == manager.id and session["can_manage_librarians"] is True
    # The new staff login is restricted, and does not inherit manager permission.
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": user.email, "password": password, "expected_role": "librarian"}).status_code == 200
    assert create(client).status_code == 403
    assert client.put("/api/user/change-password", json={"current_password": password, "new_password": "ChangedStaffPass2"}).status_code == 200
    assert client.get("/api/auth/session").json()["can_manage_librarians"] is False
    assert create(client).status_code == 403


@pytest.mark.parametrize("status", ["unavailable", "failed"])
def test_unconfirmed_delivery_exposes_one_time_handoff_only_to_manager(client, db_session, manager, monkeypatch, status):
    monkeypatch.setattr(librarian_accounts, "deliver_registration_credentials", lambda **values: {"channel": "email", "status": status})
    response = create(client)
    assert response.status_code == 201
    result = response.json()
    user = db_session.get(User, result["account"]["id"])
    assert verify_password(result["temporary_password"], user.password_hash)
    listing = client.get("/api/librarian/staff")
    assert result["temporary_password"] not in listing.text
    assert "password_hash" not in listing.text and "face_encoding" not in listing.text
    assert result["password_delivery"]["status"] == status


def test_wrong_password_and_duplicate_member_email_do_not_create_or_deliver(client, db_session, manager, monkeypatch):
    def unexpected(**values):
        raise AssertionError("Must not send credentials")
    monkeypatch.setattr(librarian_accounts, "deliver_registration_credentials", unexpected)
    assert create(client, current_password="WrongPass1").status_code == 403
    account(db_session, "New@Example.com", "member")
    assert create(client).status_code == 409
    assert db_session.query(User).count() == 2


@pytest.mark.parametrize("extra", [{"name": "   "}, {"email": "invalid"}, {"role": "librarian"}, {"can_manage_librarians": True}])
def test_invalid_inputs_and_attempted_permission_injection_are_rejected(client, db_session, manager, extra):
    assert create(client, **extra).status_code == 422
    assert db_session.query(User).count() == 1


def test_identity_conflict_rolls_back_before_delivery(client, db_session, manager, monkeypatch):
    manager.member_id = "RPL-TAKEN"
    db_session.commit()
    monkeypatch.setattr(librarian_accounts, "new_staff_member_id", lambda db: "RPL-TAKEN")
    monkeypatch.setattr(librarian_accounts, "deliver_registration_credentials", lambda **kw: pytest.fail("Must not deliver"))
    assert create(client).status_code == 409
    assert db_session.query(User).count() == 1


def test_list_is_librarian_only_and_paged_without_private_material(client, db_session, manager):
    account(db_session, "member@example.com", "member")
    account(db_session, "second@example.com")
    response = client.get("/api/librarian/staff?page_size=1&page=2")
    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 2 and len(result["items"]) == 1 and result["page"] == 2
    assert result["items"][0]["email"] == "second@example.com"
    assert "password_hash" not in response.text and "avatar_url" not in response.text
    assert client.get("/api/librarian/staff?page_size=101").status_code == 422


def test_designation_changes_take_effect_on_the_next_request(client, db_session, manager):
    other = account(db_session, "other@example.com")
    designate_librarian_manager(db_session, other.id)
    db_session.commit()
    assert create(client).status_code == 403
    assert client.get("/api/auth/session").json()["can_manage_librarians"] is False
    login(client, other)
    assert client.get("/api/librarian/staff").status_code == 200


@pytest.mark.parametrize("role,status,restricted", [("member", "active", False), ("librarian", "suspended", False), ("librarian", "active", True)])
def test_operator_designation_rejects_ineligible_accounts(db_session, role, status, restricted):
    user = account(db_session, role=role, must_change_password=restricted)
    user.status = status
    db_session.commit()
    with pytest.raises(ValueError):
        designate_librarian_manager(db_session, user.id)


def test_operator_cli_dry_run_then_apply_and_explicit_replacement(db_session, monkeypatch, capsys):
    import designate_librarian
    from database import SessionLocal as TestingSessionLocal
    first = account(db_session)
    second = account(db_session, "second@example.com")
    monkeypatch.setattr(designate_librarian, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("sys.argv", ["designate_librarian.py", "--user-id", str(first.id)])
    designate_librarian.main()
    assert "Dry run" in capsys.readouterr().out
    assert db_session.get(LibrarySetting, MANAGER_SETTING_KEY) is None
    monkeypatch.setattr("sys.argv", ["designate_librarian.py", "--user-id", str(first.id), "--apply"])
    designate_librarian.main()
    assert db_session.get(LibrarySetting, MANAGER_SETTING_KEY).value == str(first.id)
    monkeypatch.setattr("sys.argv", ["designate_librarian.py", "--user-id", str(second.id), "--apply"])
    with pytest.raises(SystemExit):
        designate_librarian.main()
    db_session.expire_all()
    assert db_session.get(LibrarySetting, MANAGER_SETTING_KEY).value == str(first.id)
