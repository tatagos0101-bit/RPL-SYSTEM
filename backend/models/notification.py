from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from database import Base
from timezone_utils import now_ph


class Notification(Base):
    __tablename__ = "notifications"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=True)   # set = user-targeted; null = librarian-targeted
    message        = Column(String(255), nullable=False)
    type           = Column(String(50), nullable=False, default="reservation")
    member_name    = Column(String(100), nullable=True)
    book_title     = Column(String(200), nullable=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=True)
    is_read        = Column(Boolean, default=False, nullable=False)
    created_at     = Column(DateTime(timezone=True), default=now_ph)
