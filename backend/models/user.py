from sqlalchemy import Boolean, Column, Integer, String, Text, Enum, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id             = Column(Integer, primary_key=True, index=True)
    member_id      = Column(String(20), unique=True, nullable=True, index=True)
    name           = Column(String(120), nullable=False)
    email          = Column(String(180), unique=True, nullable=True, index=True)
    password_hash  = Column(String(255), nullable=False)
    must_change_password = Column(Boolean, nullable=False, default=False)
    email_verified = Column(Boolean, nullable=False, default=False)
    phone_verified = Column(Boolean, nullable=False, default=False)
    role           = Column(Enum("member", "librarian", name="user_role", native_enum=False, create_constraint=True), nullable=False, default="member")
    phone          = Column(String(30), nullable=True)
    location       = Column(String(120), nullable=True)
    status         = Column(Enum("active", "suspended", name="user_status", native_enum=False, create_constraint=True), nullable=False, default="active")

    # 128-float face encoding stored as JSON array string e.g. "[0.123, -0.456, ...]"
    face_encoding  = Column(Text, nullable=True)

    # Valid government ID uploaded during librarian-assisted registration
    id_image_url   = Column(String(300), nullable=True)

    # Profile avatar photo uploaded by the member
    avatar_url     = Column(String(300), nullable=True)

    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())
    # An identity-free, permanently disabled row preserves historical foreign keys.
    deleted_at     = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    transactions   = relationship("Transaction",  back_populates="user")
    reservations   = relationship("Reservation",  back_populates="user")
    entry_logs     = relationship("EntryLog",     back_populates="user")
    reading_goals  = relationship("ReadingGoal",  back_populates="user")
    security_alerts = relationship("SecurityAlert", back_populates="user")
    face_embeddings = relationship("FaceEmbedding", back_populates="user", cascade="all, delete-orphan")
