"""Durable Supabase uploads; private assets use fresh, short-lived signed URLs."""
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException

from config import (
    STORAGE_BACKEND, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_COVERS_BUCKET, SUPABASE_AVATARS_BUCKET, SUPABASE_IDS_BUCKET,
    STORAGE_SIGNED_URL_SECONDS,
)

BUCKETS = {"covers": SUPABASE_COVERS_BUCKET, "avatars": SUPABASE_AVATARS_BUCKET, "ids": SUPABASE_IDS_BUCKET}
BUCKETS["imports"] = "rpl-imports"
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf"}


def _request(method: str, endpoint: str, **kwargs) -> httpx.Response:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Cloud storage is not configured.")
    headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY}
    # Legacy service_role keys are JWTs. New sb_secret keys use only apikey.
    if not SUPABASE_SERVICE_ROLE_KEY.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
    headers.update(kwargs.pop("headers", {}))
    try:
        response = httpx.request(method, f"{SUPABASE_URL}/storage/v1/{endpoint}", headers=headers, timeout=30, **kwargs)
        response.raise_for_status()
        return response
    except httpx.HTTPError:
        # Upstream responses can contain credentials or internal URLs.
        raise HTTPException(502, "Cloud storage is unavailable. Please try again.") from None


def save_upload(folder: str, filename: str, content: bytes) -> str:
    if folder not in BUCKETS or Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise ValueError("Invalid upload path.")
    if STORAGE_BACKEND == "local":
        directory = Path("uploads") / folder
        directory.mkdir(parents=True, exist_ok=True)
        (directory / filename).write_bytes(content)
        return f"/uploads/{folder}/{filename}"
    bucket = BUCKETS[folder]
    path = f"{quote(bucket, safe='')}/{quote(filename, safe='')}"
    _request("POST", f"object/{path}", content=content,
             headers={"Content-Type": CONTENT_TYPES.get(Path(filename).suffix.lower(), "application/octet-stream"), "x-upsert": "false"})
    if folder == "covers":
        return f"{SUPABASE_URL}/storage/v1/object/public/{path}"
    # Store object identities, never expiring signed URLs, in the database.
    return f"supabase://{bucket}/{filename}"


def create_upload_url(folder: str, filename: str) -> str:
    path = f"{quote(BUCKETS[folder], safe='')}/{quote(filename, safe='')}"
    result = _request("POST", f"object/upload/sign/{path}", json={}).json()
    signed = result.get("url") or result.get("signedURL") or result.get("signedUrl")
    if not signed:
        raise HTTPException(502, "Cloud storage did not return an upload URL.")
    return signed if signed.startswith("https://") else f"{SUPABASE_URL}/storage/v1/{signed.lstrip('/')}"


def read_cloud_upload(folder: str, filename: str) -> bytes:
    path = f"{quote(BUCKETS[folder], safe='')}/{quote(filename, safe='')}"
    return _request("GET", f"object/authenticated/{path}").content


def cloud_reference(folder: str, filename: str) -> str:
    if folder == "covers":
        return f"{SUPABASE_URL}/storage/v1/object/public/{quote(BUCKETS[folder], safe='')}/{quote(filename, safe='')}"
    return f"supabase://{BUCKETS[folder]}/{filename}"


def resolve_upload_url(reference: str | None) -> str | None:
    if not reference or not reference.startswith("supabase://"):
        return reference
    parsed = urlsplit(reference)
    if parsed.netloc not in BUCKETS.values() or not parsed.path.strip("/"):
        raise ValueError("Unknown storage reference.")
    path = f"{quote(parsed.netloc, safe='')}/{quote(parsed.path.lstrip('/'), safe='/')}"
    result = _request("POST", f"object/sign/{path}", json={"expiresIn": STORAGE_SIGNED_URL_SECONDS}).json()
    signed = result.get("signedURL") or result.get("signedUrl")
    if not signed:
        raise HTTPException(502, "Cloud storage did not return an asset URL.")
    if signed.startswith("https://"):
        return signed
    return f"{SUPABASE_URL}/storage/v1/{signed.lstrip('/')}"


def delete_upload(reference: str | None, *, folder: str) -> None:
    """Delete only files owned by the requested category, never arbitrary paths."""
    if not reference:
        return
    if reference.startswith("supabase://"):
        parsed = urlsplit(reference)
        if parsed.netloc != BUCKETS[folder]:
            return
        _request("DELETE", f"object/{quote(parsed.netloc, safe='')}", json={"prefixes": [parsed.path.lstrip('/')]})
    elif STORAGE_BACKEND == "local" and reference.startswith(f"/uploads/{folder}/"):
        filename = reference.removeprefix(f"/uploads/{folder}/")
        if filename == Path(filename).name and "/" not in filename and "\\" not in filename:
            (Path("uploads") / folder / filename).unlink(missing_ok=True)
