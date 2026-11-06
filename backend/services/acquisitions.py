"""Acquisition metadata for newly created copies; caller owns commit/rollback."""
from models.book_copy import BookCopy
from models.copy_acquisition import CopyAcquisition


def record_new_copies(db, book_id, details, actor_id, after_number=0):
    if details is None:
        return
    values = details.model_dump() if hasattr(details, 'model_dump') else details
    if not any(value is not None for value in values.values()):
        return
    copies = db.query(BookCopy).filter(BookCopy.book_id == book_id, BookCopy.copy_number > after_number).all()
    for copy in copies:
        db.add(CopyAcquisition(copy_id=copy.id, recorded_by=actor_id, updated_by=actor_id, **values))
