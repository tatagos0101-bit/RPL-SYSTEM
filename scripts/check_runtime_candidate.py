"""Read-only validation of an explicitly selected Supabase runtime LOGIN.

Supply the new URI only through RPL_RUNTIME_CANDIDATE_URI or a hidden prompt.
Never falls back to DATABASE_URL/POSTGRES_URL or loads application configuration.
Does not provision roles, migrate, read patron rows, or change the live connection.
"""
import argparse
import getpass
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TABLES = frozenset((
    "users", "auth_sessions", "books", "book_copies", "book_interactions", "transactions",
    "reservations", "notifications", "entry_logs", "reading_goals", "face_embeddings",
    "password_reset_codes", "security_alerts", "library_settings",
))


class VerificationFailure(Exception):
    def __init__(self, stage, category, diagnostic=None):
        self.stage = stage
        self.category = category
        self.diagnostic = diagnostic or {}


def safe_diagnostic(error):
    kinds = {"AssertionError", "RuntimeError", "InterfaceError", "InternalError", "OperationalError",
             "ProgrammingError", "DatabaseError", "InvalidRequestError", "NotImplementedError",
             "ValueError", "TypeError", "AttributeError", "ImportError", "FileNotFoundError"}
    state = getattr(getattr(error, "orig", error), "sqlstate", None)
    message = str(getattr(error, "orig", error)).lower()
    reasons = (
        ("password authentication failed", "authentication"),
        ("tenant or user not found", "pooler_target"),
        ("could not translate host name", "dns"),
        ("failed to resolve host", "dns"),
        ("name or service not known", "dns"),
        ("connection refused", "refused"),
        ("timeout expired", "timeout"),
        ("timed out", "timeout"),
        ("certificate verify failed", "tls"),
        ("ssl error", "tls"),
        ("no password supplied", "missing_password"),
        ("scram authentication", "authentication_protocol"),
    )
    reason = next((label for pattern, label in reasons if pattern in message), "unclassified")
    return {"kind": type(error).__name__ if type(error).__name__ in kinds else "other",
            "sqlstate": state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else "none",
            "reason": reason}


def failure_category(error):
    """Return only fixed categories, never database messages or configuration."""
    from sqlalchemy.exc import OperationalError, DatabaseError
    import psycopg
    state = getattr(getattr(error, "orig", error), "sqlstate", None)
    if state in ("28P01", "28000"):
        return "authentication"
    if state == "42501":
        return "database_permissions"
    if isinstance(error, (OperationalError, psycopg.OperationalError)):
        return "connection"
    if isinstance(error, (DatabaseError, psycopg.DatabaseError)):
        return "query_rejected"
    if isinstance(error, ValueError):
        return "validation"
    if isinstance(error, FileNotFoundError):
        return "missing_artifact"
    if isinstance(error, ImportError):
        return "missing_dependency"
    if isinstance(error, AttributeError):
        return "unsupported_attribute"
    if isinstance(error, TypeError):
        return "unexpected_type"
    return "internal"


def worker_environment(uri):
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    environment.update(PYTHON_DOTENV_DISABLED="1", RPL_RUNTIME_CANDIDATE_URI=uri)
    return environment


def target_settings(uri, host, project_ref, role):
    from sqlalchemy.engine import make_url
    url = make_url(uri)
    if not (
        re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host)
        and re.fullmatch(r"[a-z0-9]{20}", project_ref)
        and re.fullmatch(r"rpl_[a-z0-9_]{1,48}", role)
        and role != "rpl_app_runtime"
        and url.drivername in ("postgres", "postgresql", "postgresql+psycopg")
        and url.host == host and url.port == 6543 and url.database == "postgres"
        and url.username == f"{role}.{project_ref}" and bool(url.password)
        and set(url.query) <= {"sslmode", "sslrootcert"}
        and url.query.get("sslmode", "require") in ("require", "verify-ca", "verify-full")
    ):
        raise ValueError("Candidate target/configuration mismatch")
    spec = importlib.util.spec_from_file_location(
        "runtime_candidate_database_config", ROOT / "backend/services/database_config.py")
    config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config)
    return config.engine_settings(uri, production=True)


def validate_rows(rows, schema):
    expected = TABLES | ({"reservation_confirmations", "inventory_writes"} if schema == "repair16" else set())
    if schema not in ("baseline14", "repair16") or len(rows) != len(expected) + 1:
        raise ValueError("Incomplete verifier result")
    names = [row.get("table_name") for row in rows[1:]]
    if len(set(names)) != len(expected) or set(names) != expected:
        raise ValueError("Unexpected table result")
    role_checks = {
        "restricted_role_attributes", "direct_runtime_login", "runtime_group_inherited",
        "no_extra_role_memberships", "cannot_delegate_roles", "owns_no_database",
        "owns_no_application_schema", "required_tables_present", "cannot_create_public_objects",
        "cannot_create_schemas",
    } | ({"baseline_schema_only"} if schema == "baseline14" else set())
    table_checks = {
        "table_name", "rls_enabled", "runtime_is_not_owner", "runtime_subject_to_rls",
        "has_runtime_crud", "no_extra_table_privileges", "cannot_delegate_table_access",
        "anon_denied", "authenticated_denied", "required_sequence_access",
        "cannot_reset_or_delegate_sequence",
    }
    if set(rows[0]) != role_checks or any(set(row) != table_checks for row in rows[1:]):
        raise ValueError("Unexpected verifier columns")
    if any(value is not True for row in rows for key, value in row.items() if key != "table_name"):
        raise ValueError("Runtime permissions did not pass")
    return {"schema": schema, "tables_checked": len(expected), "permissions_passed": True}


def verify(uri, host, project_ref, role, schema):
    from sqlalchemy import create_engine
    url, options = target_settings(uri, host, project_ref, role)
    if schema not in ("baseline14", "repair16"):
        raise ValueError("Unsupported schema")
    suffix = "_baseline14" if schema == "baseline14" else ""
    statement = (ROOT / f"supabase/operations/check_runtime_access{suffix}.sql").read_text()
    engine = create_engine(url, **options)
    raw = None
    stage = "connect"
    try:
        raw = engine.raw_connection()
        connection = raw.driver_connection
        stage = "tls"
        if not connection.pgconn.ssl_in_use:
            raise ValueError("TLS is required")
        stage = "transaction_setup"
        connection.autocommit = True
        with connection.cursor() as cursor:
            # Compare identity in the database; never return the actual role name.
            stage = "identity"
            cursor.execute("BEGIN READ ONLY")
            cursor.execute("SET LOCAL statement_timeout='5s'")
            cursor.execute("SELECT current_user = %s AND session_user = %s, "
                           "current_setting('transaction_read_only') = 'on'", (role, role))
            if cursor.fetchone() != (True, True):
                raise ValueError("Runtime identity mismatch")
            cursor.execute("ROLLBACK")
            stage = "metadata_query"
            cursor.execute(statement)
            rows = []
            while True:
                if cursor.description:
                    names = [column.name for column in cursor.description]
                    rows.extend(dict(zip(names, row)) for row in cursor.fetchall())
                if not cursor.nextset():
                    break
        stage = "metadata_validation"
        result = validate_rows(rows, schema)
        return {**result, "tls_encrypted": True, "expected_login": True}
    except Exception as error:
        raise VerificationFailure(stage, failure_category(error), safe_diagnostic(error)) from None
    finally:
        try:
            if raw is not None:
                try:
                    raw.driver_connection.rollback()
                finally:
                    raw.close()
        finally:
            engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pooler-host", required=True)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--schema", choices=("baseline14", "repair16"), required=True)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        logging.disable(logging.CRITICAL)
        environment = worker_environment(os.environ.get("RPL_RUNTIME_CANDIDATE_URI", ""))
        os.environ.clear()
        os.environ.update(environment)
        try:
            result = verify(os.environ.get("RPL_RUNTIME_CANDIDATE_URI", ""), args.pooler_host,
                            args.project_ref, args.role, args.schema)
            print(json.dumps(result))
            return 0
        except VerificationFailure as error:
            print(json.dumps({"error": error.category, "stage": error.stage}))
            return 1
        except Exception as error:
            print(json.dumps({"error": failure_category(error)}))
            return 1
    uri = os.environ.get("RPL_RUNTIME_CANDIDATE_URI")
    if not uri:
        if not sys.stdin.isatty():
            print("FAIL: provide the candidate URI through a protected environment or interactive hidden prompt")
            return 1
        uri = getpass.getpass("New runtime candidate URI (hidden): ")
    command = [sys.executable, str(Path(__file__).resolve()), "--worker",
               "--pooler-host", args.pooler_host, "--project-ref", args.project_ref,
               "--role", args.role, "--schema", args.schema]
    try:
        result = subprocess.run(command, env=worker_environment(uri), capture_output=True,
                                text=True, timeout=60)
        expected = {"schema": args.schema, "tables_checked": 14 if args.schema == "baseline14" else 16,
                    "permissions_passed": True, "tls_encrypted": True, "expected_login": True}
        if result.returncode != 0 or json.loads(result.stdout) != expected:
            raise ValueError("Candidate verification failed")
        print(f"PASS: encrypted pooler connection, expected restricted login and {expected['tables_checked']} table checks")
        return 0
    except (subprocess.SubprocessError, ValueError):
        print("FAIL: candidate verification; connection and exception details withheld")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
