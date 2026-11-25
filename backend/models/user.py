from sqlalchemy import Boolean, Column, Integer, String, Text, Enum, DateTime, Index, false
from sqlalchemy.orm import deferred, relationship
from sqlalchemy.sql import func
from database import Base
from services.biometric_crypto import BiometricText


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("uq_users_id_document_digest", "id_document_digest", unique=True),)

    id             = Column(Integer, primary_key=True, index=True)
    member_id      = Column(String(20), unique=True, nullable=True, index=True)
    name           = Column(String(120), nullable=False)
    email          = Column(String(180), unique=True, nullable=True, index=True)
    password_hash  = Column(String(255), nullable=False)
    must_change_password = Column(Boolean, nullable=False, default=False)
    temporary_password_expires_at = Column(DateTime(timezone=True), nullable=True)
    privacy_consent_pending = Column(Boolean, nullable=False, default=False, server_default=false())
    privacy_policy_version = Column(String(32), nullable=True)
    privacy_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)
    face_consent_version = Column(String(32), nullable=True)
    face_consent_at = Column(DateTime(timezone=True), nullable=True)
    face_consent_method = Column(String(24), nullable=True)
    face_consent_recorded_by_id = Column(Integer, nullable=True)
    # Generated-data presentation only; never an identity/authentication signal.
    face_enrollment_display_only = Column(Boolean, nullable=False, default=False, server_default=false())
    email_verified = Column(Boolean, nullable=False, default=False)
    phone_verified = Column(Boolean, nullable=False, default=False)
    role           = Column(Enum("member", "librarian", name="user_role", native_enum=False, create_constraint=True), nullable=False, default="member")
    phone          = Column(String(30), nullable=True)
    location       = Column(String(120), nullable=True)
    generated_location = Column(String(120), nullable=True)
    status         = Column(Enum("active", "suspended", name="user_status", native_enum=False, create_constraint=True), nullable=False, default="active")
    is_blacklisted = Column(Boolean, nullable=False, default=False, server_default=false())

    # JSON in server memory; encrypted TEXT at rest when encryption is enabled.
    face_encoding  = deferred(Column(BiometricText("users.face_encoding"), nullable=True))

    # Valid government ID uploaded during librarian-assisted registration
    id_image_url   = Column(String(300), nullable=True)
    # Never infer verification from a legacy upload or a display-only face badge.
    id_document_digest = Column(String(64), nullable=True)
    id_document_type = Column(String(40), nullable=True)
    id_verified_at = Column(DateTime(timezone=True), nullable=True)
    id_verified_by_id = Column(Integer, nullable=True)
    face_id_verified_at = Column(DateTime(timezone=True), nullable=True)

    # Profile avatar photo uploaded by the member
    avatar_url     = Column(String(300), nullable=True)

    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())
    # An identity-free, permanently disabled row preserves historical foreign keys.
    deleted_at     = Column(DateTime(timezone=True), nullable=True)

    @property
    def requires_privacy_consent(self) -> bool:
        return self.role == "member" and bool(self.privacy_consent_pending)

    # Relationships
    transactions   = relationship("Transaction", back_populates="user", foreign_keys="Transaction.user_id")
    reservations   = relationship("Reservation",  back_populates="user")
    entry_logs     = relationship("EntryLog",     back_populates="user")
    reading_goals  = relationship("ReadingGoal",  back_populates="user")
    security_alerts = relationship("SecurityAlert", back_populates="user")
    face_embeddings = relationship("FaceEmbedding", back_populates="user", cascade="all, delete-orphan")
