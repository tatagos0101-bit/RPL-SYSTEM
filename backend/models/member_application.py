from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from database import Base
from timezone_utils import now_ph


class MemberApplication(Base):
    __tablename__ = "member_applications"

    id = Column(Integer, primary_key=True)
    receipt = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), nullable=True, index=True)
    location = Column(String(120), nullable=False)
    status = Column(String(20), nullable=False, default="pending", index=True)
    terms_version = Column(String(32), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=now_ph)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_reason = Column(String(40), nullable=True)
    review_notes = Column(String(1000), nullable=True)
    member_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
