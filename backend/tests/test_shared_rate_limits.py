import logging
from types import SimpleNamespace

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from config import validate_rate_limit_config
from limiter import build_limiter, client_limit_key, limiter
from models.auth_session import AuthSession
from models.user import User
from routers.auth import _hash


@pytest.mark.parametrize("uri", [
    "redis://:synthetic-secret@localhost:6379/0",
    "rediss://localhost:6379/0",
    "rediss://:synthetic-secret@example.test/0?ssl_cert_reqs=none",
    "https://example.test", "rediss://:synthetic-secret@example.test:invalid/0",
])
def test_production_redis_validation_is_private_and_requires_tls(uri):
    with pytest.raises(RuntimeError) as error:
        validate_rate_limit_config(uri, "production", True)
    assert uri not in str(error.value)
    assert "synthetic-secret" not in str(error.value)


def test_required_shared_storage_cannot_silently_use_memory():
    with pytest.raises(RuntimeError, match="RATE_LIMIT_STORAGE_URI"):
        build_limiter("", "production", True)
    validate_rate_limit_config("", "development", False)


def test_redis_instances_use_same_shared_backend_without_memory_fallback():
    uri = "rediss://:synthetic-secret@example.test:6379/0"
    first = build_limiter(uri, "production", True)
    second = build_limiter(uri, "production", True)
    for instance in (first, second):
        assert instance._storage.__class__.__name__ == "RedisStorage"
        assert not instance._in_memory_fallback_enabled
        assert not instance._swallow_errors
        connection = instance._storage.storage.connection_pool.connection_kwargs
        assert connection["socket_connect_timeout"] == 2
        assert connection["socket_timeout"] == 2
        assert connection["ssl_cert_reqs"] == "required"
    assert first._key_prefix == second._key_prefix


def test_limit_keys_do_not_store_raw_client_addresses_or_trust_forwarded_headers():
    request = SimpleNamespace(client=SimpleNamespace(host="192.0.2.10"),
                              headers={"x-forwarded-for": "198.51.100.20"})
    key = client_limit_key(request)
    assert len(key) == 64
    assert "192.0.2.10" not in key
    request.headers["x-forwarded-for"] = "198.51.100.21"
    assert client_limit_key(request) == key


def test_redis_failure_rejects_login_without_credential_disclosure(client, db_session, monkeypatch):
    user = User(name="Synthetic account", email="limits@example.test", role="member",
                password_hash=_hash("Password1"))
    db_session.add(user)
    db_session.commit()
    monkeypatch.setattr(limiter, "enabled", True)
    def unavailable(*args, **kwargs):
        raise RedisConnectionError("rediss://:PRIVATE_SENTINEL@example.test")
    monkeypatch.setattr(limiter._limiter, "hit", unavailable)
    records = []
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())
    handler = Capture()
    limiter.logger.addHandler(handler)
    try:
        result = client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    finally:
        limiter.logger.removeHandler(handler)
    assert result.status_code == 503
    assert "PRIVATE_SENTINEL" not in result.text
    assert not any("PRIVATE_SENTINEL" in message for message in records)
    assert db_session.query(AuthSession).count() == 0


def test_configured_limit_rejects_excess_attempts(client, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    responses = [client.post("/api/auth/login", json={"email": "unknown@example.test", "password": "Password1"})
                 for _ in range(8)]
    assert all(response.status_code == 401 for response in responses[:7])
    assert responses[7].status_code == 429
