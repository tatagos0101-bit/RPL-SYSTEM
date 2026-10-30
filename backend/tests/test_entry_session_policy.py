from datetime import datetime, timedelta

from models.entry_log import EntryLog
from models.user import User
from services.entry_session_policy import record_entry_scan


def _member(db_session, name="Juan Dela Cruz", member_id="RPL-TEST1"):
    user = User(
        name=name,
        email=f"{member_id.lower()}@example.com",
        password_hash="hashed",
        role="member",
        member_id=member_id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_first_scan_creates_time_in_session(db_session):
    user = _member(db_session)
    seen_at = datetime(2026, 7, 1, 8, 0, 0)

    log, action = record_entry_scan(db_session, user, seen_at=seen_at)
    db_session.commit()

    assert action == "time_in"
    assert log.accessed_at == seen_at
    assert log.time_out is None
    assert log.granted is True
    assert log.note == user.name


def test_repeated_scan_before_five_minutes_keeps_user_inside(db_session):
    user = _member(db_session)
    first_seen = datetime(2026, 7, 1, 8, 0, 0)
    record_entry_scan(db_session, user, seen_at=first_seen)
    db_session.commit()

    log, action = record_entry_scan(
        db_session,
        user,
        seen_at=first_seen + timedelta(minutes=4, seconds=59),
    )
    db_session.commit()

    assert action == "still_inside"
    assert log.accessed_at == first_seen
    assert log.time_out is None
    assert db_session.query(EntryLog).filter(EntryLog.user_id == user.id).count() == 1


def test_scan_after_five_minutes_sets_time_out(db_session):
    user = _member(db_session)
    first_seen = datetime(2026, 7, 1, 8, 0, 0)
    record_entry_scan(db_session, user, seen_at=first_seen)
    db_session.commit()

    exit_seen = first_seen + timedelta(minutes=5)
    log, action = record_entry_scan(db_session, user, seen_at=exit_seen)
    db_session.commit()

    assert action == "time_out"
    assert log.accessed_at == first_seen
    assert log.time_out == exit_seen


def test_scan_within_two_minutes_after_time_out_updates_same_session(db_session):
    user = _member(db_session)
    first_seen = datetime(2026, 7, 1, 8, 0, 0)
    exit_seen = first_seen + timedelta(minutes=5)
    record_entry_scan(db_session, user, seen_at=first_seen)
    record_entry_scan(db_session, user, seen_at=exit_seen)
    db_session.commit()

    later_exit_seen = exit_seen + timedelta(minutes=1, seconds=30)
    log, action = record_entry_scan(db_session, user, seen_at=later_exit_seen)
    db_session.commit()

    assert action == "time_out_updated"
    assert log.accessed_at == first_seen
    assert log.time_out == later_exit_seen
    assert db_session.query(EntryLog).filter(EntryLog.user_id == user.id).count() == 1


def test_scan_two_minutes_after_time_out_starts_new_visit(db_session):
    user = _member(db_session)
    first_seen = datetime(2026, 7, 1, 8, 0, 0)
    exit_seen = first_seen + timedelta(minutes=5)
    record_entry_scan(db_session, user, seen_at=first_seen)
    record_entry_scan(db_session, user, seen_at=exit_seen)
    db_session.commit()

    new_visit_seen = exit_seen + timedelta(minutes=10)
    log, action = record_entry_scan(db_session, user, seen_at=new_visit_seen)
    db_session.commit()

    assert action == "time_in"
    assert log.accessed_at == new_visit_seen
    assert log.time_out is None
    assert db_session.query(EntryLog).filter(EntryLog.user_id == user.id).count() == 2



def test_distinct_encounters_close_short_visit_and_preserve_completed_times(db_session):
    user = _member(db_session)
    start = datetime(2026, 7, 1, 8, 0, 0)
    first, action = record_entry_scan(db_session, user, seen_at=start, distinct_encounter=True)
    assert action == "time_in"
    end = start + timedelta(seconds=12)
    closed, action = record_entry_scan(db_session, user, seen_at=end, distinct_encounter=True)
    assert action == "time_out"
    assert closed.id == first.id
    assert closed.accessed_at == start
    assert closed.time_out == end
    next_visit, action = record_entry_scan(db_session, user, seen_at=end + timedelta(seconds=10), distinct_encounter=True)
    assert action == "time_in"
    assert next_visit.id != closed.id
    assert closed.time_out == end
    assert db_session.query(EntryLog).count() == 2
