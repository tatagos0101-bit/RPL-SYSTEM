from sqlalchemy import Column, String
from database import Base


class LibrarySetting(Base):
    __tablename__ = "library_settings"

    key   = Column(String(80), primary_key=True)
    value = Column(String(255), nullable=False)
