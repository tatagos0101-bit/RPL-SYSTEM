from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies import get_current_user
from models.user import User
from services.cloud_uploads import prepare_upload

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
