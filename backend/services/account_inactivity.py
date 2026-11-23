"""Inactive member reviews. Acquire the member row before a notice row."""
import calendar
from contextlib import contextmanager
from datetime import timedelta
from queue import Empty, Queue
from threading import Thread
from time import monotonic

from fastapi import HTTPException
from sqlalchemy import event, func, or_, select, text, update
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from config import ALLOWED_ORIGINS
from models.account_deletion_notice import AccountDeletionNotice as Notice
from models.auth_session import AuthSession
from models.entry_log import EntryLog
from models.notification import Notification
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from services import otp_delivery
from services.member_deletion import delete_account, lock_existing_member
from timezone_utils import as_ph, now_ph


def cutoff(now):
    now = as_ph(now)
    year, month = divmod(now.year * 12 + now.month - 1 - 6, 12)
    month += 1
    return now.replace(year=year, month=month, day=min(now.day, calendar.monthrange(year, month)[1]))


def record_activity(db, member, at):
    if member.role != "member":
        return
    at = as_ph(at)
    # The conditional UPDATE locks the member without refreshing a password
    # snapshot used by the caller for session binding.
    db.execute(update(User).where(User.id == member.id, User.deleted_at.is_(None),
        or_(User.last_activity_at.is_(None), User.last_activity_at < at)
    ).values(last_activity_at=at).execution_options(synchronize_session=False))
    db.query(Notice).filter(Notice.user_id == member.id, Notice.status == "pending",
                            Notice.last_activity_at < at).update({"status": "cancelled"}, synchronize_session=False)


def history_sources():
    return ((EntryLog, EntryLog.accessed_at, (EntryLog.granted.is_(True),)),
            (Transaction, Transaction.borrow_date, ()), (Transaction, Transaction.return_date, ()),
            (Reservation, Reservation.reserved_at, ()), (AuthSession, AuthSession.created_at, ()))


def latest_activity(db, member):
    dates = [member.created_at, member.last_activity_at]
    sources = [select(func.max(column)).where(model.user_id == member.id, *conditions).scalar_subquery()
               for model, column, conditions in history_sources()]
    dates.extend(db.execute(select(*sources)).one())
    return max((as_ph(value) for value in dates if value is not None), default=None)


def outstanding(user_id):
    return select(Transaction.id).where(Transaction.user_id == user_id, or_(
        Transaction.status.in_(("active", "overdue")), Transaction.type == "borrow",
        Transaction.return_date.is_(None))).exists()


def latest_notice(db, user_id):
    return db.query(Notice).filter_by(user_id=user_id).order_by(Notice.created_at.desc(), Notice.id.desc()).first()


def message(member, activity, created, deadline):
    days = (as_ph(created).date() - as_ph(activity).date()).days
    first = member.name.split()[0] if member.name.strip() else "there"
    return (f"Hello {first}, we hope you’re doing well! It has been {days} days since your last recorded library "
            f"activity. We’d love to welcome you back. Please sign in, choose Keep my account, or contact the "
            f"library by {as_ph(deadline):%B %d, %Y at %I:%M %p} Philippine time if you’d like to keep your "
            "membership. If we don’t hear from you, your account will be sent to the librarian for deletion "
            "review. If you’ve visited recently, please let us know so we can update your record.")


def reserve_sqlite_writer(db):
    if db.get_bind().dialect.name == "sqlite":
        # SQLite ignores FOR UPDATE. A no-row write reserves the writer slot
        # even when the caller already owns a transaction. No member is changed.
        db.execute(text("UPDATE users SET id = id WHERE 0"))


def snapshot_current(db, member, notice):
    activity = latest_activity(db, member)
    return activity is not None and activity <= as_ph(notice.last_activity_at)


def create(db, user_id):
    notice, _ = create_or_get(db, user_id)
    return notice


def create_or_get(db, user_id):
    reserve_sqlite_writer(db)
    member = lock_existing_member(db, user_id)
    activity = latest_activity(db, member)
    existing = db.query(Notice).filter_by(user_id=user_id, status="pending").with_for_update().populate_existing().first()
    if existing:
        if activity is not None and activity <= as_ph(existing.last_activity_at):
            db.commit()
            return existing, False
        existing.status = "cancelled"
        db.commit()
        return create_or_get(db, user_id)
    now = now_ph()
    if activity is None or activity > cutoff(now) or db.scalar(select(outstanding(user_id))):
        raise HTTPException(409, "This member is not eligible for an inactivity notice.")
    deadline = now + timedelta(hours=72)
    channel = "email" if member.email else "in_app"
    notification = Notification(user_id=user_id, type="account_inactivity",
                                message=message(member, activity, now, deadline), created_at=now)
    db.add(notification)
    db.flush()
    notice = Notice(user_id=user_id, notification_id=notification.id, last_activity_at=activity,
                    created_at=now, respond_by=deadline, status="pending", delivery_channel=channel,
                    delivery_status="in_app" if channel == "in_app" else "pending")
    db.add(notice)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = db.query(Notice).filter_by(user_id=user_id, status="pending").first()
        if winner is None:
            raise
        return winner, False
    return notice, True


def locked(db, notice_id, owner=None):
    reserve_sqlite_writer(db)
    user_id = db.scalar(select(Notice.user_id).where(Notice.id == notice_id))
    if user_id is None or (owner is not None and owner != user_id):
        raise HTTPException(404, "Notice not found.")
    member = lock_existing_member(db, user_id, allow_deleted=True)
    notice = db.query(Notice).filter_by(id=notice_id).with_for_update().populate_existing().one()
    return member, notice


def reply(db, notice_id, owner=None):
    member, notice = locked(db, notice_id, owner)
    if notice.status == "pending" and member.deleted_at is None:
        if snapshot_current(db, member, notice):
            record_activity(db, member, now_ph())
        notice.status = "cancelled"
        db.commit()
    return notice


def approve(db, notice_id):
    member, notice = locked(db, notice_id)
    if notice.status != "pending" or member.deleted_at:
        raise HTTPException(409, "This notice is closed.")
    if not snapshot_current(db, member, notice):
        notice.status = "cancelled"
        db.commit()
        raise HTTPException(409, "The member has renewed their activity.")
    if now_ph() < as_ph(notice.respond_by):
        raise HTTPException(409, "The response window is still open.")
    delete_account(db, member)
    db.commit()


def deliver(db, notice_id, *, end=None):
    if end is not None and monotonic() + 9 >= end:
        return
    member, notice = locked(db, notice_id)
    if notice.delivery_status != "pending" or notice.status != "pending":
        db.commit()
        return
    if not snapshot_current(db, member, notice):
        notice.status = "cancelled"
        db.commit()
        return
    channel = notice.delivery_channel
    if channel != "email":
        # Pending notices from the retired SMS path keep their durable inbox notice.
        notice.delivery_channel = "in_app"
        notice.delivery_status = "in_app"
        db.commit()
        return
    destination = member.email
    if not otp_delivery.configured("email") or not destination:
        notice.delivery_status = "unavailable"
        db.commit()
        return
    body = message(member, notice.last_activity_at, notice.created_at, notice.respond_by)
    if ALLOWED_ORIGINS and notice.notification_id:
        body += f"\n\n{ALLOWED_ORIGINS[0].rstrip('/')}/user/notifications/{notice.notification_id}"
    if end is not None and monotonic() + 9 >= end:
        db.rollback()
        return
    # A committed conditional claim also guards against a second SQLite writer.
    claimed = db.query(Notice).filter_by(id=notice_id, delivery_status="pending", status="pending").update(
        {"delivery_status": "unknown"}, synchronize_session=False)
    db.commit()
    if not claimed or (end is not None and monotonic() + 9 >= end):
        return
    outcome = send_once(channel, destination, body)
    _, notice = locked(db, notice_id)
    notice.delivery_status = outcome
    db.commit()


def send_once(channel, destination, body):
    # SMTP negotiates several socket operations. Bound the entire wait, even
    # if DNS or a provider takes longer than its individual socket timeout.
    result = Queue(maxsize=1)

    def send():
        result.put(transport(channel, destination, body))

    Thread(target=send, daemon=True).start()
    try:
        return result.get(timeout=8)
    except Empty:
        return "unknown"


def transport(channel, destination, body):
    if channel != "email":
        return "unavailable"
    try:
        otp_delivery.send_email(destination, "Your library membership", body,
                                idempotency_prefix="rpl-inactivity", timeout=2, max_attempts=1)
    except otp_delivery.DeliveryUncertain:
        return "unknown"
    except (otp_delivery.DeliveryUnavailable, ValueError):
        return "failed"
    except Exception:
        return "unknown"
    return "accepted"


def newer_activity(threshold):
    checks = [User.last_activity_at.is_not(None) & (User.last_activity_at > threshold), User.created_at.is_not(None) & (User.created_at > threshold)]
    for model, column, conditions in history_sources():
        checks.append(select(model.user_id).where(model.user_id == User.id, column > threshold,
                      *conditions).correlate(User, Notice).exists())
    return or_(*checks)


def job_deadline():
    return monotonic() + 45


def require_time(end, minimum=0):
    remaining = end - monotonic()
    if remaining <= minimum:
        raise HTTPException(503, "The notice check reached its time limit.")
    return remaining


@contextmanager
def job_session(db, end):
    engine = db.get_bind()
    if engine.dialect.name != "postgresql":
        require_time(end)
        yield db
        return

    # NullPool uses a 10-second connect timeout. Hold one connection across
    # the independent commits and keep provider I/O outside all transactions.
    require_time(end, minimum=10)
    with engine.connect() as conn:
        require_time(end)

        def limit_statement(connection, cursor, statement, parameters, context, executemany):
            remaining_ms = max(1, int(require_time(end) * 1000))
            cursor.execute(f"SET LOCAL statement_timeout = {min(remaining_ms, 5000)}")
            cursor.execute(f"SET LOCAL lock_timeout = {min(remaining_ms, 2000)}")

        event.listen(conn, "before_cursor_execute", limit_statement)
        try:
            with Session(conn, autoflush=False) as scoped:
                yield scoped
        finally:
            event.remove(conn, "before_cursor_execute", limit_statement)


def check(db, *, dry_run=False):
    end = job_deadline()
    with job_session(db, end) as scoped:
        return check_batch(scoped, end, dry_run)


def known_activity():
    signals = [User.created_at.is_not(None), User.last_activity_at.is_not(None)]
    for model, column, conditions in history_sources():
        signals.append(select(model.user_id).where(model.user_id == User.id,
            column.is_not(None), *conditions).correlate(User).exists())
    return or_(*signals)


def check_batch(db, end, dry_run):
    require_time(end)
    counts = {"created": 0, "processed": 0}
    pending = db.query(Notice.id).filter_by(status="pending", delivery_status="pending").order_by(Notice.created_at)
    if dry_run:
        return {"created": 0, "processed": 0, "pending_delivery": pending.count()}
    stale = (db.query(Notice.id).join(User, User.id == Notice.user_id)
             .filter(Notice.status == "pending", newer_activity(Notice.last_activity_at))
             .order_by(Notice.created_at).limit(10).all())
    for (notice_id,) in stale:
        if monotonic() + 9 >= end:
            return counts
        member, notice = locked(db, notice_id)
        if notice.status == "pending" and not snapshot_current(db, member, notice):
            notice.status = "cancelled"
        db.commit()
    for (notice_id,) in pending.limit(3).all():
        if monotonic() + 9 >= end:
            return counts
        deliver(db, notice_id, end=end)
        counts["processed"] += 1
        if monotonic() + 9 >= end:
            return counts
    room = 3 - counts["processed"]
    candidates = db.query(User.id).filter(User.role == "member", User.deleted_at.is_(None),
        known_activity(), ~outstanding(User.id), ~newer_activity(cutoff(now_ph())),
        ~select(Notice.id).where(Notice.user_id == User.id, Notice.status == "pending").exists()).order_by(User.id)
    for (user_id,) in candidates.limit(room).all():
        if monotonic() + 9 >= end:
            break
        try:
            notice, created = create_or_get(db, user_id)
        except HTTPException as exc:
            db.rollback()
            if exc.status_code in (404, 409):
                continue
            raise
        counts["created"] += int(created)
        deliver(db, notice.id, end=end)
        counts["processed"] += 1
        if monotonic() + 9 >= end:
            break
    return counts


def view(db, notice):
    member = db.get(User, notice.user_id)
    status = notice.status
    if status == "pending":
        if not snapshot_current(db, member, notice):
            status = "cancelled"
        else:
            status = "ready_for_review" if now_ph() >= as_ph(notice.respond_by) else "waiting"
    return dict(id=notice.id, user_id=member.id, member_name=member.name, member_id=member.member_id,
        last_activity_at=as_ph(notice.last_activity_at),
        inactive_days=(as_ph(notice.created_at).date() - as_ph(notice.last_activity_at).date()).days,
        created_at=as_ph(notice.created_at), respond_by=as_ph(notice.respond_by), status=status,
        delivery_channel=notice.delivery_channel, delivery_status=notice.delivery_status,
        notification_id=notice.notification_id, has_outstanding_loans=db.scalar(select(outstanding(member.id))),
        message=message(member, notice.last_activity_at, notice.created_at, notice.respond_by))
