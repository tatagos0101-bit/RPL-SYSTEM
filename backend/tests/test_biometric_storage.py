import base64
import json
import os

import pytest
from sqlalchemy import text

from biometric_storage_migrate import FIELDS, migrate
from models.face_embedding import FaceEmbedding
from models.security_alert import SecurityAlert
from models.user import User
from services.biometric_crypto import BiometricStorageError, decrypt, encrypt, settings


@pytest.fixture
def keyring(monkeypatch):
    # Ephemeral synthetic keys, never deployment secrets.
    keys = {name: base64.urlsafe_b64encode(os.urandom(32)).decode() for name in ("first", "second")}
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_MODE", "transition")
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEYS", json.dumps(keys))
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "first")
    return keys


def seed(db):
    user = User(name="Synthetic encryption test", password_hash="unused", face_encoding="[0.1, 0.2]")
    db.add(user)
    db.flush()
    db.add(FaceEmbedding(user_id=user.id, engine="synthetic", dimension=2, embedding="[0.3, 0.4]", is_active=False))
    db.add(SecurityAlert(user_id=user.id, alert_type="SPOOF_ENROLL", snapshot_b64="data:image/jpeg;base64,c3ludGhldGlj"))
    db.commit()
    return user


@pytest.mark.parametrize("context", [f"{table}.{column}" for table, column in FIELDS])
def test_authenticated_random_encryption_and_context(keyring, context):
    first = encrypt("synthetic", context)
    assert first != encrypt("synthetic", context)
    assert decrypt(first, context) == "synthetic"
    wrong_context = next(item for item in ("users.face_encoding", "face_embeddings.embedding") if item != context)
    with pytest.raises(BiometricStorageError):
        decrypt(first, wrong_context)
    parts = first.split(":", 3)
    payload = bytearray(base64.urlsafe_b64decode(parts[3]))
    payload[-1] ^= 1
    parts[3] = base64.urlsafe_b64encode(payload).decode()
    with pytest.raises(BiometricStorageError):
        decrypt(":".join(parts), context)
    with pytest.raises(BiometricStorageError):
        encrypt(first, context)


def test_raw_storage_orm_bulk_writes_and_deletion(db_session, keyring):
    user = seed(db_session)
    for table, column in FIELDS:
        stored = db_session.execute(text(f"SELECT {column} FROM {table}")).scalar_one()
        assert stored.startswith("rplbio:v1:first:")
    db_session.expire_all()
    assert db_session.get(User, user.id).face_encoding == "[0.1, 0.2]"
    assert db_session.query(FaceEmbedding).one().embedding == "[0.3, 0.4]"
    assert db_session.query(SecurityAlert).one().snapshot_b64.endswith("c3ludGhldGlj")
    db_session.query(User).filter_by(id=user.id).update({User.face_encoding: "[0.5]"})
    db_session.commit()
    assert decrypt(db_session.execute(text("SELECT face_encoding FROM users")).scalar_one(), "users.face_encoding") == "[0.5]"
    # Existing enrollment filters compare only NULL / empty values.
    assert db_session.query(User).filter(User.face_encoding != "").count() == 1
    from services.member_deletion import delete_face_data
    delete_face_data(db_session, db_session.get(User, user.id))
    db_session.commit()
    assert db_session.execute(text("SELECT face_encoding FROM users")).scalar_one() is None
    assert db_session.query(FaceEmbedding).count() == 0
    assert db_session.execute(text("SELECT snapshot_b64 FROM security_alerts")).scalar_one() is None


def test_audit_backfill_rotation_and_strict_read(db_session, keyring, monkeypatch):
    seed(db_session)
    # Simulate pre-upgrade rows through raw SQL; include inactive embeddings.
    for table, column in FIELDS:
        db_session.execute(text(f"UPDATE {table} SET {column} = :value"), {"value": "synthetic-legacy"})
    db_session.commit()
    engine = db_session.get_bind()
    audit = migrate(engine, batch_size=1)
    assert all(counts["plaintext"] == 1 and counts["rewritten"] == 0 for counts in audit.values())
    for table, column in FIELDS:
        assert db_session.execute(text(f"SELECT {column} FROM {table}")).scalar_one() == "synthetic-legacy"
    db_session.rollback()
    applied = migrate(engine, apply=True, batch_size=1)
    assert all(counts["rewritten"] == 1 for counts in applied.values())
    assert all(counts["rewritten"] == 0 for counts in migrate(engine, apply=True).values())
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "second")
    assert all(counts["old_key"] == 1 for counts in migrate(engine).values())
    assert all(counts["rewritten"] == 1 for counts in migrate(engine, apply=True).values())
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEYS", json.dumps({"second": keyring["second"]}))
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_MODE", "strict")
    assert all(counts["plaintext"] == counts["old_key"] == 0 for counts in migrate(engine).values())
    db_session.expire_all()
    assert db_session.query(User).one().face_encoding == "synthetic-legacy"
    with pytest.raises(BiometricStorageError):
        decrypt("[0.1]", "users.face_encoding")


def test_failed_batch_rolls_back_and_never_emits_data(db_session, keyring):
    seed(db_session)
    db_session.execute(text("UPDATE users SET face_encoding = 'synthetic-legacy'"))
    db_session.add(User(name="Another synthetic", password_hash="unused"))
    db_session.commit()
    db_session.execute(text("UPDATE users SET face_encoding = 'rplbio:v1:first:damaged' WHERE name = 'Another synthetic'"))
    db_session.commit()
    with pytest.raises(BiometricStorageError) as error:
        migrate(db_session.get_bind(), apply=True)
    assert "damaged" not in str(error.value) and "synthetic" not in str(error.value)
    assert db_session.execute(text("SELECT face_encoding FROM users ORDER BY id LIMIT 1")).scalar_one() == "synthetic-legacy"


@pytest.mark.parametrize("value", ["rplbio:v2:first:AAA=", "rplbio:v1:missing:AAA=", "rplbio:v1:first:!"])
def test_bad_envelopes_fail_closed(keyring, value):
    with pytest.raises(BiometricStorageError):
        decrypt(value, "users.face_encoding")


@pytest.mark.parametrize("name,value", [
    ("BIOMETRIC_ENCRYPTION_KEYS", "invalid-secret"),
    ("BIOMETRIC_ENCRYPTION_KEYS", '{"first":"bad-key"}'),
    ("BIOMETRIC_ENCRYPTION_KEYS", "{}"),
    ("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "missing"),
    ("BIOMETRIC_ENCRYPTION_MODE", "typo"),
])
def test_invalid_config_never_writes_plaintext(keyring, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(BiometricStorageError) as error:
        encrypt("synthetic-private-input", "users.face_encoding")
    assert value not in str(error.value)


def test_production_requires_encryption(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("BIOMETRIC_ENCRYPTION_MODE", raising=False)
    monkeypatch.delenv("BIOMETRIC_ENCRYPTION_KEYS", raising=False)
    monkeypatch.delenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", raising=False)
    with pytest.raises(BiometricStorageError):
        settings()
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_MODE", "legacy")
    with pytest.raises(BiometricStorageError):
        settings()


def test_wrong_key_and_safe_api_error(db_session, client, keyring, monkeypatch):
    from routers.auth import _hash
    user = seed(db_session)
    user.email = "crypto@example.test"
    user.password_hash = _hash("Password1")
    db_session.commit()
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEYS", json.dumps({"first": keyring["second"]}))
    response = client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert response.status_code == 200  # Password auth does not need to decrypt a face.
    response = client.get("/api/user/profile")
    assert response.status_code == 503
    assert response.json() == {"detail": "Biometric storage is temporarily unavailable. Contact library staff."}


def test_ciphertext_never_exposed_by_profile(client, db_session, keyring):
    from routers.auth import _hash
    user = seed(db_session)
    user.email = "profile@example.test"
    user.password_hash = _hash("Password1")
    db_session.commit()
    response = client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert response.status_code == 200
    profile = client.get("/api/user/profile")
    assert profile.status_code == 200
    assert not any(value in profile.text for value in ("rplbio:", "[0.1, 0.2]", "face_encoding", "snapshot_b64"))
