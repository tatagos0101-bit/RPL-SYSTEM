"""
timezone_utils.py — Philippines Standard Time (UTC+8) helpers.

Philippines does not observe Daylight Saving Time, so UTC+8 is always correct.
Import `PH_TZ` and `now_ph()` anywhere a "current time" is needed instead of
using datetime.now(timezone.utc).
"""
from datetime import datetime, timezone, timedelta

# Philippines Standard Time — fixed UTC+8 offset (no DST)
PH_TZ = timezone(timedelta(hours=8), name="PHT")


def now_ph() -> datetime:
    """Return the current datetime in Philippines Standard Time (UTC+8)."""
    return datetime.now(PH_TZ)
