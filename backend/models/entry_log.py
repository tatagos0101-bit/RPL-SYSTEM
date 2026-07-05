from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class EntryLog(Base):
    __tablename__ = "entry_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable = guest
    entry_type  = Column(Enum("face_scan", "manual"), nullable=False, default="face_scan")
    granted     = Column(Boolean, nullable=False, default=True)
    note        = Column(String(255), nullable=True)   # e.g. "Unknown visitor" or member name snapshot
    accessed_at = Column(DateTime(timezone=True), server_default=func.now())  # time_in (first detection)
    time_out    = Column(DateTime(timezone=True), nullable=True)               # last detection in session

    user = relationship("User", back_populates="entry_logs")
