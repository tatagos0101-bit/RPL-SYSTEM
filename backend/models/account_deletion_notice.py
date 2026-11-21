from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, text

from database import Base


class AccountDeletionNotice(Base):
    __tablename__ = "account_deletion_notices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="SET NULL"))
    last_activity_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    respond_by = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(16), nullable=False, default="pending")
    delivery_channel = Column(String(8), nullable=False)
    delivery_status = Column(String(12), nullable=False)

    __table_args__ = (
        Index("ix_account_deletion_notices_notification_id", "notification_id"),
        Index("ix_account_deletion_notices_member_created", "user_id", "created_at"),
        Index("uq_account_deletion_notices_pending_member", "user_id", unique=True,
              postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'")),
        Index("ix_account_deletion_notices_status_deadline", "status", "respond_by"),
    )
