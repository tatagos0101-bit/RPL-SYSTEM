from sqlalchemy import Column, Integer, String, DateTime, Boolean, true
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Book(Base):
    __tablename__ = "books"

    id                = Column(Integer, primary_key=True, index=True)
    title             = Column(String(255), nullable=False, index=True)
    author            = Column(String(180), nullable=False)
    category          = Column(String(80), nullable=False, index=True)
    category_override = Column(String(80), nullable=True)
    raw_api_label     = Column(String(1000), nullable=True)
    is_hidden         = Column(Boolean, nullable=False, default=True, server_default=true())
    year              = Column(Integer, nullable=True)
    isbn              = Column(String(20), nullable=True, unique=True)
    copies_total      = Column(Integer, nullable=False, default=1)
    copies_available  = Column(Integer, nullable=False, default=1)
    location_shelf    = Column(String(80), nullable=True)
    cover_url         = Column(String(500), nullable=True)

    # Unique QR string e.g. "RPL-00001"
    qr_code           = Column(String(30), unique=True, nullable=True, index=True)

    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    transactions      = relationship("Transaction",  back_populates="book")
    reservations      = relationship("Reservation",  back_populates="book")
    copies            = relationship("BookCopy", back_populates="book", cascade="all, delete-orphan")
