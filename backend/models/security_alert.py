from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id           = Column(Integer, primary_key=True, index=True)
    alert_type   = Column(String(32),  nullable=False)   # SPOOF_ENROLL | SPOOF_ENTRY | SPOOF_LOOKUP
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)  # account being spoofed (if known)
    ip_address   = Column(String(64),  nullable=True)
    snapshot_b64 = Column(Text,        nullable=True)    # base64 spoof image for evidence
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    is_read      = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="security_alerts", foreign_keys=[user_id])
