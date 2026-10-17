"""JWT migration coverage using independently signed, synthetic HMAC tokens."""
import base64
import hashlib
import hmac
import json
from datetime import timedelta

import jwt
import pytest
from fastapi import HTTPException

import config
from models.user import User
from routers.auth import _hash, _make_token
from services import cloud_uploads
from services.auth_sessions import session_claims
from timezone_utils import now_ph


def legacy_hmac_token(claims, secret=config.JWT_SECRET_KEY, algorithm="HS256"):
    def segment(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
    message = segment({"typ": "JWT", "alg": algorithm}) + b"." + segment(claims)
    signature = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    return (message + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")).decode()


def session_payload(db):
    member = User(name="JWT synthetic", email="jwt@example.test", role="member",
                  password_hash=_hash("Password1"))
    db.add(member)
    db.commit()
    token = _make_token(member.id, db)
    db.commit()
    return jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])


def test_existing_hmac_session_cookie_and_bearer_still_work(client, db_session):
    token = legacy_hmac_token(session_payload(db_session))
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    client.cookies.set("rpl_auth", token)
    assert client.get("/api/user/profile").status_code == 200


@pytest.mark.parametrize("change", ["missing_exp", "expired", "missing_sub", "wrong_scope", "wrong_algorithm", "bad_signature", "malformed"])
def test_invalid_session_tokens_fail_closed(client, db_session, change):
    claims = session_payload(db_session)
    if change == "missing_exp":
        del claims["exp"]
    if change == "expired":
        claims["exp"] = int((now_ph() - timedelta(minutes=1)).timestamp())
    if change == "missing_sub":
        del claims["sub"]
    if change == "wrong_scope":
        claims["scope"] = "upload"
    token = legacy_hmac_token(claims, secret="wrong-key" if change == "bad_signature" else config.JWT_SECRET_KEY,
                              algorithm="none" if change == "wrong_algorithm" else "HS256")
    if change == "malformed":
        token = "not.a.token"
    assert session_claims(token) is None
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_existing_hmac_upload_ticket_still_works(monkeypatch):
    import asyncio
    claims = {"sub": "17", "scope": "upload", "folder": "avatars", "object": "synthetic.png",
              "exp": int((now_ph() + timedelta(minutes=5)).timestamp())}
    monkeypatch.setattr(cloud_uploads.storage, "read_cloud_upload", lambda *_: b"synthetic")
    result = asyncio.run(cloud_uploads.read_upload(folder="avatars", user_id=17, file=None,
                                                   ticket=legacy_hmac_token(claims)))
    assert result[:2] == (b"synthetic", "synthetic.png")


@pytest.mark.parametrize("change", ["missing_exp", "expired", "wrong_owner", "wrong_folder", "wrong_scope", "path", "bad_signature"])
def test_upload_ticket_rejected_before_storage_read(monkeypatch, change):
    import asyncio
    claims = {"sub": "17", "scope": "upload", "folder": "avatars", "object": "synthetic.png",
              "exp": int((now_ph() + timedelta(minutes=5)).timestamp())}
    if change == "missing_exp":
        del claims["exp"]
    elif change == "expired":
        claims["exp"] = 1
    else:
        updates = {"wrong_owner": {"sub": "18"}, "wrong_folder": {"folder": "ids"},
                   "wrong_scope": {"scope": "session"}, "path": {"object": "../synthetic.png"}}
        claims.update(updates.get(change, {}))
    def unexpected_read(*_):
        pytest.fail("Invalid ticket reached storage")
    monkeypatch.setattr(cloud_uploads.storage, "read_cloud_upload", unexpected_read)
    token = legacy_hmac_token(claims, secret="wrong-key" if change == "bad_signature" else config.JWT_SECRET_KEY)
    with pytest.raises(HTTPException) as error:
        asyncio.run(cloud_uploads.read_upload(folder="avatars", user_id=17, file=None, ticket=token))
    assert error.value.status_code == 403


@pytest.mark.parametrize("algorithm", ["none", "RS256", "ES256", "HS256,RS256"])
def test_startup_refuses_algorithms_outside_shared_secret_design(monkeypatch, algorithm):
    monkeypatch.setattr(config, "JWT_ALGORITHM", algorithm)
    with pytest.raises(RuntimeError, match="JWT_ALGORITHM"):
        config.validate_deployment_config()
