from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, false
from database import Base


class BookInteraction(Base):
    __tablename__ = "book_interactions"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), primary_key=True)
    is_favorite = Column(Boolean, nullable=False, default=False, server_default=false())
    viewed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_book_interactions_book_user", "book_id", "user_id"),)
