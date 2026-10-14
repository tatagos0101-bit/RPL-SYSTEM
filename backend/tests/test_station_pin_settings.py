import pytest
from sqlalchemy.orm import Session

import config
from models.library_settings import LibrarySetting
from models.user import User
from routers.auth import _hash, _make_token
from services.entry_station_pin import SETTING_KEY

PATH = "/api/librarian/settings/entry-station-pin"
PASSWORD = "StaffPassword9"
PIN = "083729"
REPLACEMENT = "942680"


@pytest.fixture
def staff(db_session):
    user = User(name="Test librarian", email="pin-staff@example.test",
                role="librarian", status="active", password_hash=_hash(PASSWORD))
    db_session.add(user)
    db_session.commit()
    return user


def headers(user):
    return {"Authorization": f"Bearer {_make_token(user.id)}"}


def save(client, staff, pin=PIN, password=PASSWORD):
    return client.put(PATH, headers=headers(staff),
                      json={"current_password": password, "new_pin": pin})


def scan_logs(client, pin):
    return client.get("/api/kiosk/entry-logs", headers={"X-Entry-Station-Pin": pin})


def test_initial_setup_without_environment_pin_persists_hash_only(client, db_session, staff, monkeypatch):
    monkeypatch.setattr(config, "ENTRY_STATION_PIN", "")
    assert client.get(PATH, headers=headers(staff)).json() == {"configured": False}
    assert scan_logs(client, PIN).status_code == 503
    response = save(client, staff)
    assert response.status_code == 200
    assert response.json() == {"configured": True}
    with Session(db_session.get_bind()) as fresh:
        stored = fresh.get(LibrarySetting, SETTING_KEY).value
        assert stored != PIN and stored.startswith("hmac-sha256:")
    assert scan_logs(client, PIN).status_code == 200
    assert client.get(PATH, headers=headers(staff)).json() == {"configured": True}


def test_rotation_rejects_old_and_environment_pins_before_face_processing(client, staff, monkeypatch):
    monkeypatch.setattr(config, "ENTRY_STATION_PIN", "1234")
    assert scan_logs(client, "1234").status_code == 200
    assert save(client, staff).status_code == 200
    assert save(client, staff, REPLACEMENT).status_code == 200
    for old in ("1234", PIN):
        assert scan_logs(client, old).status_code == 403
        response = client.post("/api/kiosk/face", json={
            "station_pin": old, "image": "data:image/jpeg;base64,not-a-real-frame",
        })
        assert response.status_code == 403
    assert scan_logs(client, REPLACEMENT).status_code == 200
    assert not client.cookies.get("rpl_auth")
    # The new PIN reaches the existing token-free kiosk processing path.
    def process(request, response, image, db, issue_token):
        assert issue_token is False
        return {"matched": False, "message": "no_face"}
    monkeypatch.setattr("routers.auth.process_entry_face", process)
    response = client.post("/api/kiosk/face", json={
        "station_pin": REPLACEMENT, "image": "data:image/jpeg;base64,not-a-real-frame",
    })
    assert response.status_code == 200
    assert response.json().get("token") is None
    assert "set-cookie" not in response.headers


@pytest.mark.parametrize("role,status,expected", [("member", "active", 403), ("librarian", "suspended", 401)])
def test_settings_reject_non_staff_and_suspended_users(client, db_session, staff, role, status, expected):
    staff.role, staff.status = role, status
    db_session.commit()
    assert client.get(PATH, headers=headers(staff)).status_code == expected
    assert save(client, staff).status_code == expected
    assert db_session.get(LibrarySetting, SETTING_KEY) is None


def test_settings_require_account_auth_even_with_station_pin(client, db_session):
    station_headers = {"X-Entry-Station-Pin": "1234"}
    assert client.get(PATH, headers=station_headers).status_code == 401
    response = client.put(PATH, headers=station_headers,
                          json={"current_password": PASSWORD, "new_pin": PIN})
    assert response.status_code == 401
    assert db_session.get(LibrarySetting, SETTING_KEY) is None


def test_wrong_password_preserves_previous_pin(client, staff):
    assert save(client, staff).status_code == 200
    response = save(client, staff, REPLACEMENT, "WrongPassword9")
    assert response.status_code == 403
    assert scan_logs(client, PIN).status_code == 200
    assert scan_logs(client, REPLACEMENT).status_code == 403
    assert REPLACEMENT not in response.text and "WrongPassword9" not in response.text


@pytest.mark.parametrize("invalid", ["12345", "1" * 13, "12a456", " 123456", "１２３４５６", 123456, None])
def test_invalid_pin_does_not_replace_existing_setting_or_echo_input(client, staff, invalid):
    assert save(client, staff).status_code == 200
    response = save(client, staff, invalid)
    assert response.status_code == 422
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])
    assert scan_logs(client, PIN).status_code == 200


def test_corrupt_managed_setting_does_not_restore_legacy_access(client, db_session, monkeypatch):
    monkeypatch.setattr(config, "ENTRY_STATION_PIN", "1234")
    db_session.add(LibrarySetting(key=SETTING_KEY, value="invalid"))
    db_session.commit()
    assert scan_logs(client, "1234").status_code == 403


def test_key_rotation_fails_closed_until_librarian_sets_pin_again(client, staff, monkeypatch):
    assert save(client, staff).status_code == 200
    monkeypatch.setattr(config, "JWT_SECRET_KEY", "replacement-test-signing-key")
    assert scan_logs(client, PIN).status_code == 403
    assert save(client, staff, REPLACEMENT).status_code == 200
    assert scan_logs(client, REPLACEMENT).status_code == 200


@pytest.mark.parametrize("legacy", ["", "1234"])
def test_production_can_start_without_pin_but_kiosk_stays_locked(client, staff, monkeypatch, legacy):
    for key, value in {
        "ENVIRONMENT": "production", "DATABASE_URL": "postgresql://example.invalid/library",
        "STORAGE_BACKEND": "supabase", "SUPABASE_URL": "https://example.invalid",
        "SUPABASE_SERVICE_ROLE_KEY": "test-only-key", "JWT_SECRET_KEY": "x" * 32,
        "LIBRARIAN_AUTH_CODE": "test-only-staff-code", "ENTRY_STATION_PIN": legacy,
        "ALLOWED_ORIGINS": ["https://example.invalid"],
    }.items():
        monkeypatch.setattr(config, key, value)
    config.validate_deployment_config()
    assert client.get(PATH, headers=headers(staff)).json() == {"configured": False}
    assert scan_logs(client, "1234").status_code == 503
    assert save(client, staff).status_code == 200
    assert scan_logs(client, PIN).status_code == 200
