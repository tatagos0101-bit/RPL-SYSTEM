"""Temporary metadata-only ASGI probe; never import application startup/models.

Stage with the reviewed SQL and database_config helper. Deploy only as an
unaliased, protected candidate, then remove it. No URI is accepted from requests.
"""
import hmac
import os
from pathlib import Path
import time

from fastapi import FastAPI, HTTPException, Request, Response

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
NO_STORE = {"Cache-Control": "no-store"}


def collect_metadata():
    from sqlalchemy import create_engine
    from services.database_config import engine_settings

    uri = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
    url, options = engine_settings(uri, production=True)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("PostgreSQL required")
    engine = create_engine(url, **options)
    raw = None
    try:
        raw = engine.raw_connection()
        # The SQL file controls BEGIN READ ONLY/ROLLBACK explicitly. Avoid an
        # implicit read-write transaction being opened before its BEGIN.
        raw.driver_connection.autocommit = True
        rows = []
        with raw.driver_connection.cursor() as cursor:
            cursor.execute(Path(__file__).with_name("audit_runtime_identity.sql").read_text())
            while True:
                if cursor.description:
                    names = [column.name for column in cursor.description]
                    rows.extend(dict(zip(names, row)) for row in cursor.fetchall())
                if not cursor.nextset():
                    break
        if len(rows) != 2 or rows[0].get("read_only_transaction") is not True:
            raise RuntimeError("Incomplete read-only metadata audit")
        if not all(type(value) in (bool, int) for row in rows for value in row.values()):
            raise RuntimeError("Unexpected non-metadata result")
        return {"identity": rows[0], "tables": rows[1]}
    finally:
        if raw is not None:
            raw.close()
        engine.dispose()


@app.get("/api/runtime-role-audit")
def runtime_role_audit(request: Request, response: Response):
    token = os.environ.get("RPL_AUDIT_TOKEN", "")
    try:
        remaining = int(os.environ.get("RPL_AUDIT_EXPIRES", "0")) - time.time()
    except ValueError:
        remaining = 0
    allowed = (
        os.environ.get("ENVIRONMENT") == "production"
        and os.environ.get("AUTO_MIGRATE", "").lower() == "false"
        and len(token) >= 40 and 0 < remaining <= 3600
        and hmac.compare_digest(request.headers.get("Authorization", "").encode(),
                                ("Bearer " + token).encode())
    )
    if not allowed:
        raise HTTPException(403, "Probe unavailable", headers=NO_STORE)
    response.headers.update(NO_STORE)
    try:
        return collect_metadata()
    except Exception:
        # Database/connection exception strings may contain configuration values.
        raise HTTPException(503, "Metadata verification unavailable", headers=NO_STORE) from None
