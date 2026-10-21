"""Temporary Preview-only wrapper for the isolated, read-only candidate checker.

Stage as backend/main.py with scripts/check_runtime_candidate.py and its fixed
dependencies. No request can supply SQL, a connection URI or a target identity.
"""
import hmac
import os
from pathlib import Path
import re
import sys
import time

from fastapi import FastAPI, HTTPException, Request, Response
from sqlalchemy.engine import make_url

from scripts.check_runtime_candidate import verify, VerificationFailure, failure_category, ROOT as CHECKER_ROOT

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
NO_STORE = {"Cache-Control": "no-store"}
EXPECTED = {"schema": "baseline14", "tables_checked": 14,
            "permissions_passed": True, "tls_encrypted": True, "expected_login": True}
FAILURES = {"configuration", "authentication", "database_permissions", "connection", "validation", "internal",
            "missing_artifact", "missing_dependency", "unsupported_attribute", "unexpected_type", "query_rejected"}
STAGES = {"connect", "tls", "transaction_setup", "identity", "metadata_query", "metadata_validation"}
POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com"


def clear_database_overrides():
    # This module is deployed alone, never imported by the application. Explicit
    # candidate-only access must not inherit libpq options or owner connections.
    for key in tuple(os.environ):
        if key == "DATABASE_URL" or key.startswith(("PG", "POSTGRES_", "SUPABASE_")):
            os.environ.pop(key, None)


clear_database_overrides()


class CandidateFailure(Exception):
    def __init__(self, category, checks=None):
        self.category = category if category in FAILURES else "internal"
        self.checks = checks


def configuration_checks():
    uri = os.environ.get("RPL_RUNTIME_CANDIDATE_URI", "")
    checks = {"present": bool(uri), "parseable": False}
    try:
        url = make_url(uri)
        checks.update(
            parseable=True,
            driver=url.drivername in ("postgres", "postgresql", "postgresql+psycopg"),
            shared_pooler_host=bool(re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", url.host or "")),
            expected_pooler_host=url.host == POOLER_HOST,
            port=url.port == 6543,
            database=url.database == "postgres",
            username=url.username == "rpl_api_runtime.quzhxkgkdrctiosyjxcr",
            password_present=bool(url.password),
            query_options=set(url.query) <= {"sslmode", "sslrootcert"},
            ssl_mode=url.query.get("sslmode", "require") in ("require", "verify-ca", "verify-full"),
        )
    except Exception:
        return checks
    return checks


def collect_metadata():
    clear_database_overrides()
    uri = os.environ.get("RPL_RUNTIME_CANDIDATE_URI", "")
    checks = configuration_checks()
    if not all(checks.values()):
        raise CandidateFailure("configuration", checks)
    # The operator-provided host must be a Supabase shared pooler; the project
    # reference, role, port and database are fixed independently of that URI.
    data = verify(uri, POOLER_HOST, "quzhxkgkdrctiosyjxcr", "rpl_api_runtime", "baseline14")
    if data != EXPECTED:
        raise ValueError("Candidate verification failed")
    return dict(EXPECTED)


@app.get("/api/runtime-candidate-check")
def runtime_candidate_check(request: Request, response: Response):
    token = os.environ.get("RPL_AUDIT_TOKEN", "")
    try:
        remaining = int(os.environ.get("RPL_AUDIT_EXPIRES", "0")) - time.time()
    except ValueError:
        remaining = 0
    allowed = (
        os.environ.get("VERCEL_ENV") == "preview"
        and os.environ.get("AUTO_MIGRATE", "").lower() == "false"
        and len(token) >= 40 and 0 < remaining <= 3600
        and hmac.compare_digest(request.headers.get("Authorization", "").encode(),
                                ("Bearer " + token).encode())
    )
    if not allowed:
        raise HTTPException(403, "Probe unavailable", headers=NO_STORE)
    response.headers.update(NO_STORE)
    try:
        if request.url.path == "/api/runtime-candidate-config":
            from psycopg import pq
            return {"configuration_checks": configuration_checks(), "setup_checks": {
                "checker_file": (Path(__file__).resolve().parent / "scripts/check_runtime_candidate.py").is_file(),
                "config_helper": (CHECKER_ROOT / "backend/services/database_config.py").is_file(),
                "metadata_sql": (CHECKER_ROOT / "supabase/operations/check_runtime_access_baseline14.sql").is_file(),
                "tls_attribute": hasattr(pq.PGconn, "ssl_in_use"),
                "python_executable": Path(sys.executable).is_file(),
            }}
        return collect_metadata()
    except CandidateFailure as error:
        raise HTTPException(503, {"category": error.category, "checks": error.checks}, headers=NO_STORE) from None
    except VerificationFailure as error:
        category = error.category if error.category in FAILURES else "internal"
        stage = error.stage if error.stage in STAGES else "unknown"
        diagnostic = error.diagnostic
        kinds = {"AssertionError", "RuntimeError", "InterfaceError", "InternalError", "OperationalError",
                 "ProgrammingError", "DatabaseError", "InvalidRequestError", "NotImplementedError",
                 "ValueError", "TypeError", "AttributeError", "ImportError", "FileNotFoundError", "other"}
        reasons = {"authentication", "pooler_target", "dns", "refused", "timeout", "tls", "missing_password", "authentication_protocol", "unclassified"}
        if set(diagnostic) != {"kind", "sqlstate", "reason"} or diagnostic.get("kind") not in kinds or diagnostic.get("reason") not in reasons or not re.fullmatch(r"[A-Z0-9]{5}|none", diagnostic.get("sqlstate", "")):
            diagnostic = {"kind": "other", "sqlstate": "none", "reason": "unclassified"}
        raise HTTPException(503, {"category": category, "stage": stage, "diagnostic": diagnostic}, headers=NO_STORE) from None
    except Exception as error:
        raise HTTPException(503, {"category": failure_category(error)}, headers=NO_STORE) from None


app.add_api_route("/api/runtime-candidate-config", runtime_candidate_check, methods=["GET"])
