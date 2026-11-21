"""Persistence and serialization for station attendance records."""
from fastapi import HTTPException
from sqlalchemy import func, or_, select, true, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from models.entry_log import EntryLog
from schemas.librarian import EntryLogOut, ManualVisitorEntryPage, ManualVisitorEntryRequest
from timezone_utils import now_ph


def serialize_entry_log(log: EntryLog) -> EntryLogOut:
    user = log.user
    return EntryLogOut(
        id=log.id,
        member_name=user.name if user else log.visitor_name,
        member_id=(user.member_id or f"RPL-{user.id:05d}") if user else None,
        visitor_name=log.visitor_name,
        visitor_location=log.visitor_location,
        entry_type=log.entry_type,
        granted=log.granted,
        is_inside=bool(log.granted and log.time_out is None),
        note=log.note,
        accessed_at=log.accessed_at,
        time_out=log.time_out,
    )


def _manual_guest_filters():
    return (
        EntryLog.entry_type == "manual",
        EntryLog.user_id.is_(None),
        EntryLog.granted.is_(True),
        EntryLog.manual_request_id.is_not(None),
    )


def list_manual_entries(
    db: Session, *, open_only: bool, search: str, skip: int, limit: int,
) -> ManualVisitorEntryPage:
    matching_query = select(EntryLog).where(*_manual_guest_filters())
    if open_only:
        matching_query = matching_query.where(EntryLog.time_out.is_(None))
    if search:
        matching_query = matching_query.where(or_(
            EntryLog.visitor_name.icontains(search, autoescape=True),
            EntryLog.visitor_location.icontains(search, autoescape=True),
        ))

    # A single statement gives the count and page the same snapshot, even for an empty page.
    matching = matching_query.cte()
    total = select(func.count().label("total")).select_from(matching).subquery()
    page = (
        select(matching).order_by(matching.c.accessed_at.desc(), matching.c.id.desc())
        .offset(skip).limit(limit).subquery()
    )
    entry = aliased(EntryLog, page)
    rows = db.execute(
        select(entry, total.c.total).select_from(total).outerjoin(page, true())
        .order_by(entry.accessed_at.desc(), entry.id.desc())
    ).all()
    return ManualVisitorEntryPage(
        items=[serialize_entry_log(log) for log, _ in rows if log is not None],
        total=rows[0].total,
    )


def create_manual_entry(db: Session, request: ManualVisitorEntryRequest) -> EntryLog:
    request_id = str(request.request_id)
    lookup = select(EntryLog).where(EntryLog.manual_request_id == request_id)
    log = db.scalar(lookup)
    if log is None:
        log = EntryLog(
            user_id=None,
            entry_type="manual",
            granted=True,
            note=request.visitor_name,
            visitor_name=request.visitor_name,
            visitor_location=request.visitor_location,
            manual_request_id=request_id,
            accessed_at=now_ph(),
        )
        db.add(log)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # The unique index decides the winner when both requests miss the initial lookup.
            log = db.scalar(lookup)
            if log is None:
                raise
        else:
            db.refresh(log)
            return log

    if (log.visitor_name, log.visitor_location) != (request.visitor_name, request.visitor_location):
        raise HTTPException(409, "This manual entry request ID has already been used for different details.")
    return log


def close_manual_entry(db: Session, entry_id: int) -> EntryLog:
    filters = (EntryLog.id == entry_id, *_manual_guest_filters())
    log = db.scalar(select(EntryLog).where(*filters).with_for_update())
    if log is None:
        raise HTTPException(404, "Manual visitor entry not found.")
    if log.time_out is None:
        # The predicate also prevents overwrites on databases that ignore SELECT FOR UPDATE.
        db.execute(
            update(EntryLog).where(*filters, EntryLog.time_out.is_(None)).values(time_out=now_ph())
        )
    db.commit()
    db.refresh(log)
    return log
