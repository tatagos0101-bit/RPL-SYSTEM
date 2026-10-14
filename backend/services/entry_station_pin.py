"""Database-managed station PIN, with a legacy environment bootstrap fallback."""
import hashlib
import hmac
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

import config
from models.library_settings import LibrarySetting

SETTING_KEY = "entry_station_pin_hash"


def _fallback_pin() -> str:
    pin = config.ENTRY_STATION_PIN
    # Allow production setup by staff, but never grant access with the dev default.
    if config.ENVIRONMENT == "production" and pin == "1234":
        return ""
    return pin


def _digest(pin: str, salt: str) -> str:
    # Keyed hashing protects short PINs against offline search from a DB dump
    # while remaining cheap enough to verify on every camera poll.
    message = f"entry-station-pin:{salt}:{pin}".encode("utf-8")
    return hmac.new(config.JWT_SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def pin_configured(db: Session) -> bool:
    return db.get(LibrarySetting, SETTING_KEY) is not None or bool(_fallback_pin())


def set_station_pin(db: Session, pin: str) -> None:
    salt = secrets.token_hex(16)
    value = f"hmac-sha256:{salt}:{_digest(pin, salt)}"
    db.merge(LibrarySetting(key=SETTING_KEY, value=value))


def verify_station_pin(db: Session, pin: str | None) -> None:
    if not pin:
        raise HTTPException(403, "Entry station PIN required.")
    # Read on every request: no stale process cache after rotation.
    setting = db.get(LibrarySetting, SETTING_KEY)
    if setting is not None:
        try:
            algorithm, salt, expected = setting.value.split(":")
            valid = algorithm == "hmac-sha256" and hmac.compare_digest(_digest(pin, salt), expected)
        except (ValueError, TypeError):
            valid = False
        # Never revive the environment PIN after a managed PIN has been saved.
    else:
        fallback = _fallback_pin()
        if not fallback:
            raise HTTPException(503, "Entry station PIN is not configured. Ask a librarian to set it in Settings.")
        valid = hmac.compare_digest(pin.encode("utf-8"), fallback.encode("utf-8"))
    if not valid:
        raise HTTPException(403, "Invalid entry station PIN.")
