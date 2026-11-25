from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from database import Base
from timezone_utils import now_ph


class MemberAccountAction(Base):
    """Librarian-approved account actions; a fee assessment is not a payment."""
    __tablename__ = "member_account_actions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)
    reason = Column(String(40), nullable=False)
    notes = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_ph)
