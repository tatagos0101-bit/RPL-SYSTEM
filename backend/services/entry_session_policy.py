from datetime import datetime

from sqlalchemy import desc
from sqlalchemy.orm import Session

from config import ENTRY_MIN_VISIT_SECONDS, ENTRY_REENTRY_GAP_SECONDS
from models.entry_log import EntryLog
from models.user import User
from timezone_utils import PH_TZ, now_ph


def _naive_ph(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(PH_TZ).replace(tzinfo=None)


def record_entry_scan(
    db: Session,
    user: User,
    *,
    seen_at: datetime | None = None,
    distinct_encounter: bool = False,
) -> tuple[EntryLog, str]:
    """
    Record one recognized entrance-station sighting.

    Updated kiosk clients supply distinct encounters after presence debouncing.
    Each encounter toggles in/out; completed timestamps are immutable.
    Legacy clients and login retain the following timed rules:
    - First scan creates time_in.
    - Repeated scan before 5 minutes keeps the member inside.
    - Scan after 5 minutes sets time_out.
    - Scan within 2 minutes after time_out updates the same session's time_out.
    - Scan 2+ minutes after time_out starts a new visit.
    """
    seen_at = _naive_ph(seen_at or now_ph())

    # Serialize attendance changes for a member on PostgreSQL.
    db.query(User).filter(User.id == user.id).with_for_update().first()

    latest = (
        db.query(EntryLog)
        .filter(EntryLog.user_id == user.id, EntryLog.granted == True)
        .order_by(desc(EntryLog.accessed_at))
        .first()
    )

    if latest is None:
        log = EntryLog(
            user_id=user.id,
            entry_type="face_scan",
            granted=True,
            note=user.name,
            accessed_at=seen_at,
            time_out=None,
        )
        db.add(log)
        db.flush()
        return log, "time_in"

    if latest.time_out is None:
        age_seconds = (seen_at - _naive_ph(latest.accessed_at)).total_seconds()
        if not distinct_encounter and age_seconds < ENTRY_MIN_VISIT_SECONDS:
            return latest, "still_inside"

        latest.time_out = seen_at
        db.flush()
        return latest, "time_out"

    gap_seconds = (seen_at - _naive_ph(latest.time_out)).total_seconds()
    if not distinct_encounter and gap_seconds < ENTRY_REENTRY_GAP_SECONDS:
        latest.time_out = seen_at
        db.flush()
        return latest, "time_out_updated"

    log = EntryLog(
        user_id=user.id,
        entry_type="face_scan",
        granted=True,
        note=user.name,
        accessed_at=seen_at,
        time_out=None,
    )
    db.add(log)
    db.flush()
    return log, "time_in"
