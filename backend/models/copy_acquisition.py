from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, CheckConstraint
from sqlalchemy.orm import relationship, backref
from database import Base
from timezone_utils import now_ph


class CopyAcquisition(Base):
    __tablename__ = 'copy_acquisitions'
    __table_args__ = (
        CheckConstraint("source IS NULL OR source IN ('purchased', 'donated', 'other')", name='ck_acquisition_source'),
        CheckConstraint('cost IS NULL OR cost >= 0', name='ck_acquisition_cost'),
    )
    copy_id = Column(Integer, ForeignKey('book_copies.id', ondelete='CASCADE'), primary_key=True)
    source = Column(String(20), nullable=True)
    acquired_on = Column(Date, nullable=True, index=True)
    party = Column(String(180), nullable=True)
    cost = Column(Numeric(12, 2), nullable=True)
    currency = Column(String(3), nullable=True)
    reference = Column(String(255), nullable=True)
    recorded_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    updated_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_ph)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=now_ph)
    copy = relationship('BookCopy', backref=backref('acquisition', uselist=False, cascade='all, delete-orphan'))
