from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ReadingGoal(Base):
    __tablename__ = "reading_goals"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    goal_type  = Column(String(50), nullable=False)   # e.g. "annual_books", "genres", "visits"
    target     = Column(Integer, nullable=False)
    current    = Column(Integer, nullable=False, default=0)
    year       = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="reading_goals")
