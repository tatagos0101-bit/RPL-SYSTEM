"""Protected unaliased full-API candidate checks; NEVER ship this in a release."""
import hmac
from io import BytesIO
import os
import re
from pathlib import Path
import threading
import time
from urllib.parse import quote, urlsplit

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

from scripts.check_runtime_candidate import validate_rows, safe_diagnostic
from scripts.runtime_workflow_checks import check, run_workflows

NO_STORE = {"Cache-Control": "no-store"}
_lock = threading.Lock()
_used = False
_stage = "identity"


def allowed(request):
    token = os.environ.get("RPL_AUDIT_TOKEN", "")
    try:
        remaining = int(os.environ.get("RPL_AUDIT_EXPIRES", "0")) - time.time()
    except ValueError:
        return False
    return (os.environ.get("VERCEL_ENV") == "production"
            and os.environ.get("AUTO_MIGRATE", "").lower() == "false"
            and len(token) >= 40 and 0 < remaining <= 3600
            and hmac.compare_digest(request.headers.get("X-RPL-Release-Probe", "").encode(), token.encode()))


def runtime_identity():
    from database import engine
    from config import DATABASE_URL
    from sqlalchemy.engine import make_url
    check(make_url(DATABASE_URL).username == "rpl_api_runtime.quzhxkgkdrctiosyjxcr")
    raw = engine.raw_connection()
    try:
        connection = raw.driver_connection
        check(connection.pgconn.ssl_in_use)
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_user='rpl_api_runtime' AND session_user='rpl_api_runtime'")
            check(cursor.fetchone() == (True,))
            cursor.execute((Path(__file__).resolve().parent / "check_runtime_access.sql").read_text())
            rows = []
            while True:
                if cursor.description:
                    names = [column.name for column in cursor.description]
                    rows.extend(dict(zip(names, row)) for row in cursor.fetchall())
                if not cursor.nextset():
                    break
        validate_rows(rows, "repair16")
    finally:
        try:
            raw.driver_connection.rollback()
        finally:
            raw.close()


def storage_checks(clients, ids):
    global _stage
    _stage = "storage_access"
    import httpx
    import jwt
    from PIL import Image
    from openpyxl import Workbook
    from config import JWT_SECRET_KEY, JWT_ALGORITHM, SUPABASE_URL, STORAGE_BACKEND
    from services import storage_service as storage

    check(STORAGE_BACKEND == "supabase")
    staff, member, other, anonymous = clients
    check(member.get("/api/user/profile").status_code == 200)
    check(anonymous.post("/api/uploads/prepare", json={"category": "avatars", "filename": "synthetic.png", "size": 80}).status_code == 401)
    for folder in ("covers", "ids", "imports"):
        filename = "synthetic.xlsx" if folder == "imports" else "synthetic.png"
        check(member.post("/api/uploads/prepare", json={"category": folder, "filename": filename, "size": 80}).status_code == 403)

    image = BytesIO()
    Image.new("RGB", (16, 16), (42, 84, 126)).save(image, format="PNG")
    workbook = BytesIO()
    book = Workbook()
    book.active.append(["Synthetic test only"])
    book.save(workbook)
    book.close()
    for folder in ("avatars", "ids", "imports", "covers"):
        _stage = "storage_" + folder
        content = workbook.getvalue() if folder == "imports" else image.getvalue()
        filename = "synthetic.xlsx" if folder == "imports" else "synthetic.png"
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if folder == "imports" else "image/png"
        client = member if folder == "avatars" else staff
        prepared = client.post("/api/uploads/prepare", json={"category": folder, "filename": filename, "size": len(content)})
        check(prepared.status_code == 200 and prepared.json()["direct"] is True)
        data = prepared.json()
        claims = jwt.decode(data["upload_ticket"], JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        object_name = claims["object"]
        check(Path(object_name).name == object_name and "/" not in object_name and "\\" not in object_name)
        check(urlsplit(data["upload_url"]).netloc == urlsplit(SUPABASE_URL).netloc)
        reference = f"supabase://{storage.BUCKETS[folder]}/{object_name}"
        try:
            check(httpx.put(data["upload_url"], content=content, headers={"Content-Type": mime}, timeout=25).is_success)
            check(storage.read_cloud_upload(folder, object_name) == content)
            public = f"{SUPABASE_URL}/storage/v1/object/public/{quote(storage.BUCKETS[folder], safe='')}/{quote(object_name, safe='')}"
            public_response = httpx.get(public, timeout=25)
            if folder == "covers":
                check(public_response.status_code == 200 and public_response.content == content)
            else:
                check(public_response.status_code in (400, 401, 403, 404))
                signed = storage.resolve_upload_url(reference)
                check(httpx.get(signed, timeout=25).content == content)
            if folder == "avatars":
                check(other.post("/api/user/avatar", data={"upload_ticket": data["upload_ticket"]}).status_code == 403)
                saved = member.post("/api/user/avatar", data={"upload_ticket": data["upload_ticket"]})
                check(saved.status_code == 200)
                check(httpx.get(saved.json()["avatar_url"], timeout=25).content == content)
                check(httpx.get(member.get("/api/user/profile").json()["avatar_url"], timeout=25).content == content)
        finally:
            storage.delete_upload(reference, folder=folder)
            remaining = storage._request("POST", f"object/list/{quote(storage.BUCKETS[folder], safe='')}",
                                         json={"prefix": "", "search": object_name, "limit": 10}).json()
            check(not any(row.get("name") == object_name for row in remaining))


def install(app):
    @app.middleware("http")
    async def protected_candidate(request, call_next):
        if not allowed(request):
            return JSONResponse(status_code=403, content={"detail": "Candidate unavailable"}, headers=NO_STORE)
        return await call_next(request)

    @app.get("/api/runtime-release-check")
    def release_check(request: Request, response: Response):
        global _used, _stage
        if not allowed(request) or not _lock.acquire(blocking=False):
            raise HTTPException(403, "Probe unavailable", headers=NO_STORE)
        try:
            if _used:
                raise HTTPException(409, "Probe unavailable", headers=NO_STORE)
            _used = True
            response.headers.update(NO_STORE)
            try:
                _stage = "identity"
                runtime_identity()
                _stage = "api_workflows"
                result = run_workflows(test_app=app,
                    client_headers={"X-RPL-Release-Probe": os.environ["RPL_AUDIT_TOKEN"]},
                    acceptance_hook=storage_checks)
                return {**result, "restricted_runtime_verified": True, "storage_checks_passed": True}
            except Exception as error:
                workflow_line = 0
                frames = []
                trace = error.__traceback__
                while trace:
                    name = Path(trace.tb_frame.f_code.co_filename).name
                    if re.fullmatch(r"[A-Za-z0-9_.-]{1,60}\.py", name):
                        frames.append({"module_file": name, "line": trace.tb_lineno})
                    if name == "runtime_workflow_checks.py" and trace.tb_frame.f_code.co_name == "run_workflows":
                        workflow_line = trace.tb_lineno
                    trace = trace.tb_next
                diagnostic = safe_diagnostic(error)
                kind = type(error).__name__
                if re.fullmatch(r"[A-Za-z_]{1,60}", kind):
                    diagnostic["kind"] = kind
                raise HTTPException(503, {"category": "release_acceptance", "stage": _stage,
                    "diagnostic": diagnostic, "workflow_line": workflow_line,
                    "frames": frames[-5:]}, headers=NO_STORE) from None
        finally:
            _lock.release()
