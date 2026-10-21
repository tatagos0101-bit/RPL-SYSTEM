import hashlib
import json
from fastapi import HTTPException
from models.inventory_write import InventoryWrite
from models.user import User


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def find_write(db, user_id, request_id, operation=None, digest=None):
    if request_id is None:
        return None
    # Serialize retries from this librarian, including requests for non-ISBN books.
    # The lock lasts until inventory and its outcome commit together.
    actor = db.query(User).filter(User.id == user_id).populate_existing().with_for_update(key_share=True).one()
    if actor.role != "librarian" or actor.status != "active":
        raise HTTPException(403, "An active librarian account is required.")
    saved = db.get(InventoryWrite, (user_id, str(request_id)))
    if saved and operation is not None and (saved.operation != operation or saved.fingerprint != digest):
        raise HTTPException(409, "This request ID belongs to a different inventory operation.")
    return saved


def remember_write(db, user_id, request_id, operation, digest, result):
    if request_id is not None:
        db.add(InventoryWrite(user_id=user_id, request_id=str(request_id),
                              operation=operation, fingerprint=digest, result=result))
