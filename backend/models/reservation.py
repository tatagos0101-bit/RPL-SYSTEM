from sqlalchemy import Column, Integer, Enum, DateTime, ForeignKey, Index, String, JSON, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        Index("ix_reservations_member_status_book", "user_id", "status", "book_id"),
        Index("uq_reservations_active_member_book", "user_id", "book_id", unique=True,
              postgresql_where=text("status IN ('pending', 'ready')"), sqlite_where=text("status IN ('pending', 'ready')")),
        Index("ix_reservations_book_queue", "book_id", "status", "reserved_at", "id"),
    )

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id        = Column(Integer, ForeignKey("books.id"), nullable=False)
    status         = Column(Enum("pending", "ready", "cancelled", "fulfilled", name="reservation_status", native_enum=False, create_constraint=True), nullable=False, default="pending")
    queue_position = Column(Integer, nullable=True)
    reserved_at    = Column(DateTime(timezone=True), server_default=func.now())
    expires_at     = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="reservations")
    book = relationship("Book", back_populates="reservations")


class ReservationConfirmation(Base):
    __tablename__ = "reservation_confirmations"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    request_id = Column(String(36), primary_key=True)
    fingerprint = Column(String(64), nullable=False)
    reservation_ids = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
