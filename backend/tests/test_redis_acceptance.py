"""Opt-in real TLS Redis checks; SQLite fixtures contain synthetic records only.

Requires RPL_RUN_REDIS_ACCEPTANCE=1, RPL_REDIS_STAGING_URI and the exact
RPL_REDIS_STAGING_HOST. Never reset/flush the shared store. Counter keys use a
random prefix and expire naturally. Run with --tb=no --show-capture=no so failures
cannot expose a provider connection string in pytest diagnostics.
"""
import os
import secrets
import socket
from urllib.parse import urlsplit

import pytest

from limiter import build_limiter, limiter
from models.auth_session import AuthSession
from models.entry_log import EntryLog
from models.user import User
from .redis_transport_gate import RedisTransportGate
from routers import auth

pytestmark = pytest.mark.skipif(os.getenv("RPL_RUN_REDIS_ACCEPTANCE") != "1",
                                reason="requires explicitly selected staging Redis")


@pytest.fixture()
def redis_gate(monkeypatch):
    uri = os.environ.get("RPL_REDIS_STAGING_URI", "")
    parts = urlsplit(uri)
    assert parts.scheme == "rediss" and parts.password
    assert parts.hostname == os.environ.get("RPL_REDIS_STAGING_HOST")
    port = parts.port or 6379
    original_resolver = socket.getaddrinfo
    upstream = original_resolver(parts.hostname, port, socket.AF_INET, socket.SOCK_STREAM)[0][4]
    with RedisTransportGate(upstream) as gate:
        def resolve(host, requested_port, *args, **kwargs):
            if host == parts.hostname and int(requested_port) == port:
                return original_resolver("127.0.0.1", gate.port, *args, **kwargs)
            return original_resolver(host, requested_port, *args, **kwargs)

        # Only TCP routing changes. Redis retains the provider hostname for TLS
        # SNI/certificate validation; the relay cannot decrypt the byte stream.
        monkeypatch.setattr(socket, "getaddrinfo", resolve)
        shared = build_limiter(uri, "production", True)
        monkeypatch.setattr(limiter, "_storage", shared._storage)
        monkeypatch.setattr(limiter, "_limiter", shared._limiter)
        monkeypatch.setattr(limiter, "_key_prefix", "rpl-acceptance:" + secrets.token_hex(16))
        monkeypatch.setattr(limiter, "enabled", True)
        try:
            yield gate
        finally:
            shared._storage.storage.connection_pool.disconnect()


def test_login_outage_recovery_preserves_counter_and_session_boundary(client, db_session, redis_gate):
    user = User(name="Synthetic Redis member", email="redis-check@example.test",
                role="member", password_hash=auth._hash("SyntheticPassword1"))
    db_session.add(user)
    db_session.commit()
    credentials = {"email": user.email, "password": "SyntheticPassword1"}
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    for _ in range(4):
        assert client.post("/api/auth/login", json={**credentials, "password": "wrong"}).status_code == 401
    assert db_session.query(AuthSession).count() == 1
    redis_gate.pause()
    failure = client.post("/api/auth/login", json=credentials)
    assert failure.status_code == 503
    assert failure.json() == {"detail": "Request verification is temporarily unavailable. Please try again."}
    assert not failure.headers.get("set-cookie")
    assert db_session.query(AuthSession).count() == 1
    redis_gate.resume()
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.post("/api/auth/login", json=credentials).status_code == 429
    assert db_session.query(AuthSession).count() == 3


def test_kiosk_routes_share_nat_budget_and_fail_closed_before_processing(client, db_session, monkeypatch, redis_gate):
    processed = []

    def synthetic_frame(request, response, image, db, issue_token):
        assert issue_token is False
        processed.append(True)
        return {"matched": False, "message": "no_face"}

    monkeypatch.setattr(auth, "process_entry_face", synthetic_frame)
    headers = {"X-Entry-Station-Pin": "1234"}
    frame = {"station_pin": "1234", "image": "data:image/jpeg;base64,c3ludGhldGlj"}
    assert client.get("/api/kiosk/entry-logs").status_code == 403
    assert client.post("/api/kiosk/face", json={**frame, "station_pin": "wrong"}).status_code == 403
    # Synthetic scans sent as a burst, not a camera/latency test. The same peer
    # models both stations behind a shared NAT bucket.
    for _ in range(60):
        result = client.post("/api/kiosk/face", json=frame)
        assert result.status_code == 200 and not result.json().get("token")
    for _ in range(6):
        assert client.get("/api/kiosk/entry-logs", headers=headers).status_code == 200
    redis_gate.pause()
    assert client.post("/api/kiosk/face", json=frame).status_code == 503
    assert client.get("/api/kiosk/entry-logs", headers=headers).status_code == 503
    assert len(processed) == 60
    redis_gate.resume()
    assert client.post("/api/kiosk/face", json=frame).status_code == 200
    assert client.get("/api/kiosk/entry-logs", headers=headers).status_code == 200
    assert len(processed) == 61
    # The earlier wrong-PIN face call also consumed a slot. Enforce the existing
    # 120/minute shared-address cap rather than raising it for multiple stations.
    for _ in range(58):
        assert client.post("/api/kiosk/face", json=frame).status_code == 200
    assert client.post("/api/kiosk/face", json=frame).status_code == 429
    assert len(processed) == 119
    for _ in range(53):
        assert client.get("/api/kiosk/entry-logs", headers=headers).status_code == 200
    assert client.get("/api/kiosk/entry-logs", headers=headers).status_code == 429
    assert db_session.query(AuthSession).count() == 0
    assert db_session.query(EntryLog).count() == 0
