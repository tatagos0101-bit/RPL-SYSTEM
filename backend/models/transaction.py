from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Numeric, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transactions_recommendation_history", "user_id", "book_id", "borrow_date"),)

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id      = Column(Integer, ForeignKey("books.id"), nullable=False)
    copy_id      = Column(Integer, ForeignKey("book_copies.id"), nullable=True, index=True)
    # One row represents a loan; a return changes its type/status in place.
    # Historical borrow counts use borrow_date, including rows now marked return.
    type         = Column(Enum("borrow", "return", name="transaction_type", native_enum=False, create_constraint=True), nullable=False)
    borrow_date  = Column(DateTime(timezone=True), server_default=func.now())
    due_date     = Column(DateTime(timezone=True), nullable=True)
    return_date  = Column(DateTime(timezone=True), nullable=True)
    fine_amount  = Column(Numeric(8, 2), default=0)
    status       = Column(Enum("active", "returned", "overdue", name="transaction_status", native_enum=False, create_constraint=True), nullable=False, default="active")
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="transactions")
    book = relationship("Book", back_populates="transactions")
    copy = relationship("BookCopy", back_populates="transactions")
