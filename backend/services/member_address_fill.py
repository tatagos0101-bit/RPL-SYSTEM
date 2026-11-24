from hashlib import sha256
from unicodedata import normalize

from sqlalchemy import update
from sqlalchemy.orm import Session

from models.user import User


# PSA Philippine Standard Geographic Code, province of Rizal. Keep the order
# stable so later runs assign the same placeholder to the same surname.
_BARANGAYS = (
    ("Angono", ("Bagumbayan", "Kalayaan", "Poblacion Ibaba", "Poblacion Itaas",
                "San Isidro", "San Pedro", "San Roque", "San Vicente", "Santo Niño", "Mahabang Parang")),
    ("Cainta", ("San Andres", "San Isidro", "San Juan", "San Roque", "Santa Rosa", "Santo Niño", "Santo Domingo")),
    ("Taytay", ("Dolores", "Muzon", "San Isidro", "San Juan", "Santa Ana")),
)
_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
_SURNAME_PREFIXES = {
    ("de", "la"), ("de", "las"), ("de", "los"), ("de",), ("del",), ("dela",),
    ("delas",), ("delos",), ("san",), ("santa",), ("santo",),
    ("da",), ("dos",), ("van",), ("von",),
}


def _surname_key(name: str) -> str:
    normalized = normalize("NFKC", name).casefold()
    before_comma, comma, after_comma = normalized.partition(",")
    words = before_comma.split()
    if comma and after_comma.strip().rstrip(".") not in _SUFFIXES:
        return "".join(words)
    while len(words) > 1 and words[-1].rstrip(".") in _SUFFIXES:
        words.pop()
    for prefix_size in (2, 1):
        if len(words) > prefix_size and tuple(words[-prefix_size - 1:-1]) in _SURNAME_PREFIXES:
            return "".join(words[-prefix_size - 1:])
    return words[-1] if words else ""


def _generated_location(surname: str) -> str:
    digest = sha256(f"rpl-address-v1:{surname}".encode("utf-8")).digest()
    municipality, barangays = _BARANGAYS[int.from_bytes(digest[:4], "big") % len(_BARANGAYS)]
    barangay = barangays[int.from_bytes(digest[4:8], "big") % len(barangays)]
    return f"Barangay {barangay}, {municipality}, Rizal"


def fill_missing_member_addresses(db: Session) -> int:
    candidates = db.query(User.id, User.name, User.location).filter(
        User.role == "member", User.deleted_at.is_(None), User.generated_location.is_(None),
    ).order_by(User.id).all()
    updated = 0
    for member in candidates:
        if (member.location or "").strip():
            continue
        surname = _surname_key(member.name) or f"member:{member.id}"
        # Match the original values so a simultaneous member edit or deletion
        # takes precedence. A placeholder does not change the member's edit history.
        result = db.execute(update(User).where(
            User.id == member.id, User.name == member.name, User.role == "member", User.deleted_at.is_(None),
            User.location == member.location, User.generated_location.is_(None),
        ).values(
            generated_location=_generated_location(surname), updated_at=User.updated_at,
        ).execution_options(synchronize_session=False))
        updated += result.rowcount
    return updated
