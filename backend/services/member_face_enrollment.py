"""Account-bound online enrollment. It does not verify a government ID."""
from fastapi import HTTPException

from services import face_engine_service as engine
from services.face_enrollment_consent import record_enrollment_consent
from services.liveness_service import require_live_enrollment


def enroll_member_face(db, member, image):
    # The caller holds this authenticated account's row lock and checks consent.
    if member.requires_privacy_consent:
        raise HTTPException(403, "Complete your required account setup before enrolling your face.")
    try:
        faces = engine.detect_faces(image, max_faces=2)
    except RuntimeError:
        raise HTTPException(503, "Face recognition is temporarily unavailable.") from None
    if len(faces) != 1:
        raise HTTPException(422, "Capture one live face in good lighting before continuing.")
    require_live_enrollment(image, faces)
    if engine.find_duplicate_for_enrollment(db, faces[0], member.id) is not None:
        raise HTTPException(409, "This face is already registered to another account. Ask the librarian for assistance.")
    engine.store_enrollment_face(db, member, faces[0], source="remote_self")
    record_enrollment_consent(member)
    # A replacement must not inherit a claim that its face was compared to an ID.
    member.face_id_verified_at = None
    return {"operation": "enrolled", "enrollment_changed": True,
        "verification_method": "account_session"}
