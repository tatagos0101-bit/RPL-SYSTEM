from sqlalchemy import Column, DateTime, ForeignKey, String, Integer

from database import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_digest = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
