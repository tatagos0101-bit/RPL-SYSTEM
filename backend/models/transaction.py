from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id      = Column(Integer, ForeignKey("books.id"), nullable=False)
    copy_id      = Column(Integer, ForeignKey("book_copies.id"), nullable=True, index=True)
    type         = Column(Enum("borrow", "return"), nullable=False)
    borrow_date  = Column(DateTime(timezone=True), server_default=func.now())
    due_date     = Column(DateTime(timezone=True), nullable=True)
    return_date  = Column(DateTime(timezone=True), nullable=True)
    fine_amount  = Column(Numeric(8, 2), default=0)
    status       = Column(Enum("active", "returned", "overdue"), nullable=False, default="active")
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="transactions")
    book = relationship("Book", back_populates="transactions")
    copy = relationship("BookCopy", back_populates="transactions")
