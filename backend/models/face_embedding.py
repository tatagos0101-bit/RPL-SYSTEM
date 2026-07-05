from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    engine = Column(String(40), nullable=False, index=True)
    dimension = Column(Integer, nullable=False)
    embedding = Column(Text, nullable=False)
    quality_score = Column(Float, nullable=True)
    source = Column(String(40), nullable=False, default="enrollment")
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="face_embeddings")
