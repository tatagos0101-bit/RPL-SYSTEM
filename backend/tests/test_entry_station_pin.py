import json
from datetime import datetime

from models.entry_log import EntryLog
from models.user import User
from timezone_utils import now_ph


def test_entry_station_logs_require_pin(client):
    response = client.get("/api/kiosk/entry-logs")

    assert response.status_code == 403
    assert response.json()["detail"] == "Entry station PIN required."


def test_entry_station_logs_accept_configured_pin(client, db_session):
    db_session.add(
        EntryLog(
            user_id=None,
            entry_type="face_scan",
            granted=False,
            note="Unknown visitor",
            accessed_at=now_ph(),
        )
    )
    db_session.commit()

    response = client.get(
        "/api/kiosk/entry-logs",
        headers={"X-Entry-Station-Pin": "1234"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_entry_station_logs_include_inside_flag_and_actual_time_out(client, db_session):
    today = now_ph().replace(hour=0, minute=0, second=0, microsecond=0)
    user = User(
        name="Maria Santos",
        email="maria@example.com",
        password_hash="hashed",
        role="member",
        member_id="RPL-MARIA",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    db_session.add_all(
        [
            EntryLog(
                user_id=user.id,
                entry_type="face_scan",
                granted=True,
                note=user.name,
                accessed_at=today.replace(hour=8),
                time_out=today.replace(hour=8, minute=6),
            ),
            EntryLog(
                user_id=user.id,
                entry_type="face_scan",
                granted=True,
                note=user.name,
                accessed_at=today.replace(hour=9),
                time_out=None,
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/kiosk/entry-logs",
        headers={"X-Entry-Station-Pin": "1234"},
    )

    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["is_inside"] is True
    assert rows[0]["time_out"] is None
    assert rows[1]["is_inside"] is False
    assert rows[1]["time_out"].startswith(today.replace(hour=8, minute=6).isoformat()[:19])


def test_entry_station_face_rejects_wrong_pin_before_scanning(client):
    response = client.post(
        "/api/kiosk/face",
        json={
            "station_pin": "wrong",
            "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid entry station PIN."


def test_kiosk_face_returns_multiple_faces_and_logs_recognized_members(client, db_session, monkeypatch):
    import services.face_service as face_service
    import services.liveness_service as liveness_service

    ana = User(
        name="Ana Reyes",
        email="ana@example.com",
        password_hash="hashed",
        role="member",
        member_id="RPL-ANA",
        face_encoding=json.dumps([0.0, 0.0]),
    )
    ben = User(
        name="Ben Cruz",
        email="ben@example.com",
        password_hash="hashed",
        role="member",
        member_id="RPL-BEN",
        face_encoding=json.dumps([1.0, 1.0]),
    )
    db_session.add_all([ana, ben])
    db_session.commit()

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr(
        face_service,
        "detect_face_encodings",
        lambda _image, max_faces=4: [
            {"encoding": [0.0, 0.0], "face_box": {"top": 0.10, "left": 0.15, "width": 0.20, "height": 0.25}},
            {"encoding": [1.0, 1.0], "face_box": {"top": 0.12, "left": 0.55, "width": 0.18, "height": 0.24}},
            {"encoding": [9.0, 9.0], "face_box": {"top": 0.35, "left": 0.35, "width": 0.16, "height": 0.20}},
        ][:max_faces],
        raising=False,
    )

    response = client.post(
        "/api/kiosk/face",
        json={
            "station_pin": "1234",
            "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert len(body["faces"]) == 3
    assert body["faces"][0]["name"] == "Ana Reyes"
    assert body["faces"][0]["member_id"] == "RPL-ANA"
    assert body["faces"][0]["face_box"] == {"top": 0.1, "left": 0.15, "width": 0.2, "height": 0.25}
    assert body["faces"][1]["name"] == "Ben Cruz"
    assert body["faces"][2]["matched"] is False
    assert body["faces"][2]["message"] == "not_recognized"

    logs = db_session.query(EntryLog).filter(EntryLog.granted == True).all()
    assert {log.user_id for log in logs} == {ana.id, ben.id}
    assert all(log.time_out is None for log in logs)


def test_kiosk_face_attempts_recognition_even_when_liveness_says_too_far(client, db_session, monkeypatch):
    import services.face_service as face_service
    import services.liveness_service as liveness_service

    user = User(
        name="Walk In Member",
        email="walkin@example.com",
        password_hash="hashed",
        role="member",
        member_id="RPL-WALK",
        face_encoding=json.dumps([0.25, 0.25]),
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("too_far", 0.0))
    monkeypatch.setattr(
        face_service,
        "detect_face_encodings",
        lambda _image, max_faces=4: [
            {"encoding": [0.25, 0.25], "face_box": {"top": 0.20, "left": 0.30, "width": 0.16, "height": 0.18}},
        ],
        raising=False,
    )

    response = client.post(
        "/api/kiosk/face",
        json={
            "station_pin": "1234",
            "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert body["message"] == "recognized"
    assert body["faces"][0]["name"] == "Walk In Member"
    assert body["faces"][0]["face_box"] == {"top": 0.2, "left": 0.3, "width": 0.16, "height": 0.18}


def test_face_auth_keeps_too_far_block_for_login(client, monkeypatch):
    import services.face_service as face_service
    import services.liveness_service as liveness_service

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("too_far", 0.0))
    monkeypatch.setattr(
        face_service,
        "detect_face_encodings",
        lambda _image, max_faces=4: (_ for _ in ()).throw(AssertionError("login should not scan too-far frames")),
        raising=False,
    )

    response = client.post(
        "/api/auth/face",
        json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"},
    )

    assert response.status_code == 200
    assert response.json()["matched"] is False
    assert response.json()["message"] == "too_far"


def test_face_auth_rejects_multiple_faces(client, monkeypatch):
    import services.face_service as face_service
    import services.liveness_service as liveness_service

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr(
        face_service,
        "detect_face_encodings",
        lambda _image, max_faces=4: [
            {"encoding": [0.0, 0.0], "face_box": {"top": 0.1, "left": 0.1, "width": 0.2, "height": 0.2}},
            {"encoding": [1.0, 1.0], "face_box": {"top": 0.1, "left": 0.6, "width": 0.2, "height": 0.2}},
        ][:max_faces],
        raising=False,
    )

    response = client.post(
        "/api/auth/face",
        json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"},
    )

    assert response.status_code == 200
    assert response.json()["matched"] is False
    assert response.json()["message"] == "multiple_faces"
