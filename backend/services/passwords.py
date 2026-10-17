"""One password policy and versioned hashing, with legacy bcrypt verification."""
from passlib.context import CryptContext

password_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated=["bcrypt"])
MAX_LOGIN_BYTES = 1024


def validate_new_password(value: str) -> str:
    if not 8 <= len(value) <= 128 or not any(c.isdigit() for c in value):
        raise ValueError("Password must have 8–128 characters and at least one digit")
    return value


def validate_login_password(value: str) -> str:
    if len(value.encode("utf-8")) > MAX_LOGIN_BYTES:
        raise ValueError("Password too long")
    return value


def hash_password(value: str) -> str:
    return password_context.hash(validate_new_password(value))


def verify_password(value: str, hashed: str) -> bool:
    try:
        validate_login_password(value)
        return password_context.verify(value, hashed)
    except (ValueError, TypeError):
        return False


def needs_legacy_replacement(value: str, hashed: str) -> bool:
    return password_context.identify(hashed) == "bcrypt" and len(value.encode("utf-8")) > 72
