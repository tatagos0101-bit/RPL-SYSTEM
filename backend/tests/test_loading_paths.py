from models.user import User
from routers.auth import _make_token
from services.qr_service import generate_qr_png


def test_session_check_is_private_and_skips_avatar_and_biometrics(client, db_session, monkeypatch):
    from routers import users
    monkeypatch.setattr(users, "resolve_upload_url", lambda *a: (_ for _ in ()).throw(AssertionError("No signing for route checks")))
    monkeypatch.setattr(users, "_face_enrolled", lambda *a: (_ for _ in ()).throw(AssertionError("No biometric check for route checks")))
    assert client.get("/api/auth/session").status_code == 401
    user = User(name="Synthetic", role="member", password_hash="unused", must_change_password=True)
    db_session.add(user); db_session.commit()
    headers = {"Authorization": "Bearer " + _make_token(user.id)}
    response = client.get("/api/auth/session", headers=headers)
    assert response.status_code == 200 and response.json() == {
        "id": user.id, "name": "Synthetic", "role": "member", "must_change_password": True}
    assert "no-store" in response.headers["cache-control"]
    assert client.get("/api/user/notifications", headers=headers).status_code == 403
    user.status = "suspended"; db_session.commit()
    assert client.get("/api/auth/session", headers=headers).status_code == 401


def test_qr_cache_retains_exact_copy_identity_and_is_bounded():
    generate_qr_png.cache_clear()
    first = generate_qr_png("RPL-BOOK-00001-C001")
    assert first.startswith(b"\x89PNG")
    assert generate_qr_png("RPL-BOOK-00001-C001") == first
    assert generate_qr_png("RPL-BOOK-00001-C002") != first
    assert generate_qr_png.cache_info().hits == 1
    assert generate_qr_png.cache_info().maxsize == 256
