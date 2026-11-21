from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class EntryLog(Base):
    __tablename__ = "entry_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable = guest
    entry_type  = Column(Enum("face_scan", "manual", name="entry_type", native_enum=False, create_constraint=True), nullable=False, default="face_scan")
    granted     = Column(Boolean, nullable=False, default=True)
    note        = Column(String(255), nullable=True)   # e.g. "Unknown visitor" or member name snapshot
    accessed_at = Column(DateTime(timezone=True), server_default=func.now())  # time_in (first detection)
    time_out    = Column(DateTime(timezone=True), nullable=True)               # last detection or manual exit
    visitor_name = Column(String(150), nullable=True)
    visitor_location = Column(String(200), nullable=True)
    manual_request_id = Column(String(36), nullable=True)

    __table_args__ = (
        Index(
            "uq_entry_logs_manual_request_id",
            manual_request_id,
            unique=True,
            postgresql_where=manual_request_id.is_not(None),
            sqlite_where=manual_request_id.is_not(None),
        ),
    )

    user = relationship("User", back_populates="entry_logs")
