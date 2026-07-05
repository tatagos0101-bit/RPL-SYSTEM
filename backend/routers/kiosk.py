"""
Entrance station endpoints.

The entrance station can run without a librarian web session, but it must be
unlocked with the station PIN before logs or camera scans are available.
"""
from secrets import compare_digest

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from config import ENTRY_STATION_PIN
from database import get_db
from limiter import limiter
from models.entry_log import EntryLog
from schemas.auth import FaceAuthRequest, FaceAuthResponse
from schemas.librarian import EntryLogOut
from timezone_utils import now_ph

router = APIRouter(prefix="/api/kiosk", tags=["Entrance Station"])


class EntryStationFaceRequest(FaceAuthRequest):
    station_pin: str


def _verify_station_pin(pin: str | None) -> None:
    if not pin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Entry station PIN required.",
        )
    if not ENTRY_STATION_PIN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Entry station PIN is not configured.",
        )
    if not compare_digest(pin, ENTRY_STATION_PIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid entry station PIN.",
        )


def require_station_pin_header(
    x_entry_station_pin: str | None = Header(default=None, alias="X-Entry-Station-Pin"),
) -> None:
    _verify_station_pin(x_entry_station_pin)


@router.post("/face", response_model=FaceAuthResponse)
@limiter.limit("120/minute")
def kiosk_face(
    request: Request,
    response: Response,
    body: EntryStationFaceRequest,
    db: Session = Depends(get_db),
):
    _verify_station_pin(body.station_pin)
    from routers.auth import process_entry_face

    return process_entry_face(request, response, body.image, db, issue_token=False)


@router.get("/entry-logs", response_model=list[EntryLogOut])
@limiter.limit("60/minute")
def kiosk_entry_logs(
    request: Request,
    _pin: None = Depends(require_station_pin_header),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    today = now_ph().replace(hour=0, minute=0, second=0, microsecond=0)

    logs = (
        db.query(EntryLog)
        .filter(EntryLog.accessed_at >= today)
        .order_by(desc(EntryLog.accessed_at))
        .limit(limit)
        .all()
    )

    result = []
    for log in logs:
        result.append(
            EntryLogOut(
                id=log.id,
                member_name=log.user.name if log.user else None,
                member_id=(log.user.member_id or f"RPL-{log.user.id:05d}") if log.user else None,
                entry_type=log.entry_type,
                granted=log.granted,
                is_inside=bool(log.granted and log.time_out is None),
                note=log.note,
                accessed_at=log.accessed_at,
                time_out=log.time_out,
            )
        )
    return result
