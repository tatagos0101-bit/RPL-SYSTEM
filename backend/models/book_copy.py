from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class BookCopy(Base):
    __tablename__ = "book_copies"
    __table_args__ = (
        UniqueConstraint("book_id", "copy_number", name="uq_book_copy_number"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    book_id     = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    copy_number = Column(Integer, nullable=False)
    qr_code     = Column(String(40), unique=True, nullable=False, index=True)
    status      = Column(
        Enum("available", "borrowed", "damaged", "lost", "retired", name="book_copy_status", native_enum=False, create_constraint=True),
        nullable=False,
        default="available",
    )
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    book = relationship("Book", back_populates="copies")
    transactions = relationship("Transaction", back_populates="copy")
