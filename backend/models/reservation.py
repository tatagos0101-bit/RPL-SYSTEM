from sqlalchemy import Column, Integer, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Reservation(Base):
    __tablename__ = "reservations"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id        = Column(Integer, ForeignKey("books.id"), nullable=False)
    status         = Column(Enum("pending", "ready", "cancelled", "fulfilled", name="reservation_status", native_enum=False, create_constraint=True), nullable=False, default="pending")
    queue_position = Column(Integer, nullable=True)
    reserved_at    = Column(DateTime(timezone=True), server_default=func.now())
    expires_at     = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="reservations")
    book = relationship("Book", back_populates="reservations")
