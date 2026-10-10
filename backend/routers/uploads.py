from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pathlib import Path
from fastapi.responses import FileResponse

from dependencies import get_current_user
from models.user import User
from services.cloud_uploads import prepare_upload
from config import STORAGE_BACKEND

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])


class UploadRequest(BaseModel):
    category: str
    filename: str = Field(max_length=255)
    size: int = Field(gt=0, le=10 * 1024 * 1024)


@router.post("/prepare")
def prepare(body: UploadRequest, current_user: User = Depends(get_current_user)):
    if body.category != "avatars" and current_user.role != "librarian":
        raise HTTPException(403, "Librarian access required.")
    return prepare_upload(body.category, body.filename, body.size, current_user.id)


# Legacy local links retain the same URL, but private uploads require a session.
local_router = APIRouter(tags=["Local private uploads"])


@local_router.get("/uploads/{category}/{filename}")
def local_private_upload(category: str, filename: str, current_user: User = Depends(get_current_user)):
    if STORAGE_BACKEND != "local" or category not in {"avatars", "ids"}:
        raise HTTPException(404, "Upload not found.")
    if Path(filename).name != filename or "\\" in filename:
        raise HTTPException(404, "Upload not found.")
    reference = f"/uploads/{category}/{filename}"
    if current_user.role != "librarian" and (category != "avatars" or current_user.avatar_url != reference):
        raise HTTPException(403, "Upload access denied.")
    path = Path("uploads") / category / filename
    if not path.is_file():
        raise HTTPException(404, "Upload not found.")
    return FileResponse(path)
