"""Versioned AES-256-GCM storage encryption; never log inputs or key material."""
import base64
import json
import os
import re
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.exc import DontWrapMixin
from sqlalchemy.types import TypeDecorator


PREFIX = "rplbio:"
VERSION = "v1"
CONTEXTS = frozenset({"users.face_encoding", "face_embeddings.embedding", "security_alerts.snapshot_b64"})


class BiometricStorageError(RuntimeError, DontWrapMixin):
    def __init__(self):
        super().__init__("Biometric storage is unavailable. Contact library staff.")


@dataclass(frozen=True)
class EncryptionSettings:
    mode: str
    active_key_id: str
    keys: dict = field(repr=False)


def _decode(value):
    return base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)


def settings():
    """Read server-only settings. Invalid configuration never falls back to plaintext."""
    production = os.getenv("ENVIRONMENT", "development") == "production"
    mode = os.getenv("BIOMETRIC_ENCRYPTION_MODE", "strict" if production else "legacy")
    active = os.getenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "")
    try:
        raw_keys = json.loads(os.getenv("BIOMETRIC_ENCRYPTION_KEYS", "{}"))
        if mode not in {"legacy", "transition", "strict"} or (production and mode == "legacy"):
            raise ValueError
        if not isinstance(raw_keys, dict):
            raise ValueError
        keys = {}
        for key_id, value in raw_keys.items():
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", key_id) or not isinstance(value, str):
                raise ValueError
            key = _decode(value)
            if len(key) != 32:
                raise ValueError
            # JWT rotation must not affect biometric decryption (or vice versa).
            jwt_secret = os.getenv("JWT_SECRET_KEY", "")
            if jwt_secret and (value == jwt_secret or key == jwt_secret.encode()):
                raise ValueError
            keys[key_id] = key
        if mode == "legacy" and (keys or active):
            raise ValueError  # Explicitly choose transition/strict when configuring keys.
        if mode != "legacy" and active not in keys:
            raise ValueError
        return EncryptionSettings(mode, active, keys)
    except (ValueError, TypeError, UnicodeError):
        raise BiometricStorageError() from None


def _aad(context, key_id):
    if context not in CONTEXTS:
        raise BiometricStorageError()
    return f"rpl-biometric:{VERSION}:{key_id}:{context}".encode()


def decrypt(value, context, *, config=None, allow_legacy=None):
    if value is None or value == "":
        return value
    config = config or settings()
    if not isinstance(value, str) or context not in CONTEXTS:
        raise BiometricStorageError()
    if not value.startswith(PREFIX):
        allowed = config.mode in {"legacy", "transition"} if allow_legacy is None else allow_legacy
        if allowed:
            return value
        raise BiometricStorageError()
    try:
        marker, version, key_id, payload = value.split(":", 3)
        if marker != "rplbio" or version != VERSION:
            raise ValueError
        packed = _decode(payload)
        if len(packed) < 28:
            raise ValueError
        return AESGCM(config.keys[key_id]).decrypt(packed[:12], packed[12:], _aad(context, key_id)).decode("utf-8")
    except (ValueError, KeyError, TypeError, UnicodeError, InvalidTag):
        raise BiometricStorageError() from None


def encrypt(value, context, *, config=None):
    if value is None or value == "":
        return value  # Preserve existing NULL/empty enrollment checks and deletion.
    config = config or settings()
    if not isinstance(value, str) or context not in CONTEXTS:
        raise BiometricStorageError()
    # ORM callers supply plaintext. Never accept an unchecked ciphertext as input.
    if value.startswith(PREFIX):
        raise BiometricStorageError()
    if config.mode == "legacy":
        return value
    nonce = os.urandom(12)
    ciphertext = AESGCM(config.keys[config.active_key_id]).encrypt(
        nonce, value.encode("utf-8"), _aad(context, config.active_key_id),
    )
    payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return f"{PREFIX}{VERSION}:{config.active_key_id}:{payload}"


class BiometricText(TypeDecorator):
    """TEXT at the database boundary, plaintext only in authorized server memory.

    Covers ORM inserts, updates, bulk updates and reads without changing recognition.
    Raw SQL maintenance must use the dedicated migration utility. Do not compare
    biometric values in SQL: randomized encryption only supports NULL/empty checks.
    """
    impl = Text
    cache_ok = True

    def __init__(self, context):
        super().__init__()
        self.context = context

    def process_bind_param(self, value, dialect):
        return encrypt(value, self.context)

    def process_result_value(self, value, dialect):
        return decrypt(value, self.context)
