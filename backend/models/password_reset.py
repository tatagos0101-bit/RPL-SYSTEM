from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from timezone_utils import now_ph


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    channel    = Column(Enum("email", "sms", name="password_reset_channel", native_enum=False, create_constraint=True), nullable=False)
    code_hash  = Column(String(128), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at    = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ph, nullable=False)
    purpose = Column(String(20), nullable=False, default="reset", server_default="reset")
    context_hash = Column(String(128), nullable=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
