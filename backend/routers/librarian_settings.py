"""Staff-managed entrance-station settings; never return credential material."""
from fastapi import APIRouter, Depends, HTTPException, Request
from services.passwords import verify_password
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_librarian
from limiter import limiter
from models.user import User
from schemas.librarian_settings import StationPinStatus, StationPinUpdate
from services.entry_station_pin import pin_configured, set_station_pin

router = APIRouter(prefix="/api/librarian/settings", tags=["Librarian settings"])


@router.get("/entry-station-pin", response_model=StationPinStatus)
def station_pin_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    return StationPinStatus(configured=pin_configured(db))


@router.put("/entry-station-pin", response_model=StationPinStatus)
@limiter.limit("5/minute")
def update_station_pin(
    request: Request,
    body: StationPinUpdate,
    db: Session = Depends(get_db),
    librarian: User = Depends(require_librarian),
):
    if not verify_password(body.current_password, librarian.password_hash):
        raise HTTPException(403, "Current password is incorrect.")
    set_station_pin(db, body.new_pin)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "The station settings changed. Please try again.") from None
    return StationPinStatus(configured=True)
