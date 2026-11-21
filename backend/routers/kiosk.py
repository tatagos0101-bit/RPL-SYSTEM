"""
Entrance station endpoints.

The entrance station can run without a librarian web session, but it must be
unlocked with the station PIN before logs or camera scans are available.
"""
from typing import Annotated

from pydantic import Field
from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from limiter import limiter
from models.entry_log import EntryLog
from schemas.auth import FaceAuthRequest, FaceAuthResponse
from schemas.librarian import (
    EntryLogOut,
    ManualVisitorEntryPage,
    ManualVisitorEntryRequest,
    ManualVisitorSearch,
)
from services.entry_station_pin import verify_station_pin
from services.manual_visitor_service import (
    close_manual_entry,
    create_manual_entry,
    list_manual_entries,
    serialize_entry_log,
)
from timezone_utils import now_ph

router = APIRouter(prefix="/api/kiosk", tags=["Entrance Station"])
StationPinHeader = Annotated[str | None, Header(alias="X-Entry-Station-Pin")]


class EntryStationFaceRequest(FaceAuthRequest):
    station_pin: str
    present_user_ids: list[int] | None = Field(default=None, max_length=50)


@router.post("/face", response_model=FaceAuthResponse)
@limiter.limit("120/minute")
def kiosk_face(
    request: Request,
    response: Response,
    body: EntryStationFaceRequest,
    db: Session = Depends(get_db),
):
    verify_station_pin(db, body.station_pin)
    from routers.auth import process_entry_face

    return process_entry_face(
        request, response, body.image, db, issue_token=False,
        present_user_ids=body.present_user_ids,
    )


@router.get("/entry-logs", response_model=list[EntryLogOut])
@limiter.limit("60/minute")
def kiosk_entry_logs(
    request: Request,
    station_pin: StationPinHeader = None,
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    verify_station_pin(db, station_pin)
    today = now_ph().replace(hour=0, minute=0, second=0, microsecond=0)

    logs = (
        db.query(EntryLog)
        .filter(EntryLog.accessed_at >= today)
        .order_by(desc(EntryLog.accessed_at))
        .limit(limit)
        .all()
    )

    return [serialize_entry_log(log) for log in logs]


@router.get("/manual-entries", response_model=ManualVisitorEntryPage)
@limiter.limit("60/minute")
def kiosk_manual_entries(
    request: Request,
    station_pin: StationPinHeader = None,
    open_only: bool = True,
    skip: int = Query(0, ge=0, le=2_147_483_647),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    verify_station_pin(db, station_pin)
    return list_manual_entries(db, open_only=open_only, search="", skip=skip, limit=limit)


@router.post("/manual-entries/search", response_model=ManualVisitorEntryPage)
@limiter.limit("60/minute")
def kiosk_search_manual_entries(
    request: Request,
    body: ManualVisitorSearch,
    station_pin: StationPinHeader = None,
    db: Session = Depends(get_db),
):
    verify_station_pin(db, station_pin)
    return list_manual_entries(
        db, open_only=body.open_only, search=body.search, skip=body.skip, limit=body.limit,
    )


@router.post("/manual-entries", response_model=EntryLogOut)
@limiter.limit("30/minute")
def kiosk_create_manual_entry(
    request: Request,
    body: ManualVisitorEntryRequest,
    station_pin: StationPinHeader = None,
    db: Session = Depends(get_db),
):
    verify_station_pin(db, station_pin)
    return serialize_entry_log(create_manual_entry(db, body))


@router.post("/manual-entries/{entry_id}/exit", response_model=EntryLogOut)
@limiter.shared_limit("30/minute", scope="kiosk-manual-exit")
def kiosk_close_manual_entry(
    request: Request,
    entry_id: int = Path(ge=1, le=2_147_483_647),
    station_pin: StationPinHeader = None,
    db: Session = Depends(get_db),
):
    verify_station_pin(db, station_pin)
    return serialize_entry_log(close_manual_entry(db, entry_id))
