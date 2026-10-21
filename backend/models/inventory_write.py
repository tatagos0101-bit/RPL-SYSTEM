from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.sql import func
from database import Base


class InventoryWrite(Base):
    """Committed outcomes only; persisted in the same transaction as inventory."""
    __tablename__ = "inventory_writes"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    request_id = Column(String(36), primary_key=True)
    operation = Column(String(20), nullable=False)
    fingerprint = Column(String(64), nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
