"""Authorized direct uploads preserve 5/10 MB files on Vercel's Python runtime."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from jose import JWTError, jwt

from config import JWT_SECRET_KEY, JWT_ALGORITHM, STORAGE_BACKEND
from services import storage_service as storage

UPLOAD_RULES = {
    "covers": ({".jpg", ".jpeg", ".png", ".webp", ".gif"}, 5 * 1024 * 1024),
    "avatars": ({".jpg", ".jpeg", ".png", ".webp"}, 5 * 1024 * 1024),
    "ids": ({".jpg", ".jpeg", ".png", ".webp", ".pdf"}, 10 * 1024 * 1024),
    "imports": ({".xlsx", ".xls"}, 10 * 1024 * 1024),
}


def prepare_upload(folder: str, filename: str, size: int, user_id: int) -> dict:
    if STORAGE_BACKEND != "supabase":
        return {"direct": False}
    if folder not in UPLOAD_RULES:
        raise HTTPException(400, "Unknown upload category.")
    extensions, limit = UPLOAD_RULES[folder]
    extension = Path(filename).suffix.lower()
    if extension not in extensions or size <= 0 or size > limit:
        raise HTTPException(400, "Invalid file type or size for this upload.")
    object_name = f"{user_id}_{uuid4().hex}{extension}"
    ticket = jwt.encode({"sub": str(user_id), "scope": "upload", "folder": folder,
                         "object": object_name, "exp": datetime.now(timezone.utc) + timedelta(minutes=30)},
                        JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return {"direct": True, "upload_url": storage.create_upload_url(folder, object_name), "upload_ticket": ticket}


async def read_upload(*, folder: str, user_id: int, file: UploadFile | None, ticket: str | None) -> tuple[bytes, str, str | None]:
    if ticket:
        try:
            claims = jwt.decode(ticket, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            filename = claims.get("object", "")
            if claims.get("scope") != "upload" or claims.get("sub") != str(user_id) or claims.get("folder") != folder or not filename or Path(filename).name != filename or "/" in filename or "\\" in filename:
                raise ValueError("Wrong upload owner or category.")
        except (JWTError, ValueError, TypeError):
            raise HTTPException(403, "Invalid or expired upload ticket.") from None
        content = storage.read_cloud_upload(folder, filename)
        if len(content) > UPLOAD_RULES[folder][1]:
            raise HTTPException(413, "Uploaded file is too large.")
        return content, filename, storage.cloud_reference(folder, filename)
    if not file:
        raise HTTPException(422, "A file or upload ticket is required.")
    return await file.read(), file.filename or "", None
