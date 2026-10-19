from contextlib import redirect_stdout
import io
import json
import os
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.pool import NullPool

import check_runtime_candidate as checker

HOST = "aws-0-ap-southeast-1.pooler.supabase.com"
PROJECT = "a" * 20
ROLE = "rpl_candidate"
URI = f"postgresql://{ROLE}.{PROJECT}:synthetic-private@{HOST}:6543/postgres?sslmode=require"
ARGS = ["check", "--pooler-host", HOST, "--project-ref", PROJECT, "--role", ROLE, "--schema", "baseline14"]


def good_rows():
    role = dict.fromkeys((
        "restricted_role_attributes", "direct_runtime_login", "runtime_group_inherited",
        "no_extra_role_memberships", "cannot_delegate_roles", "owns_no_database",
        "owns_no_application_schema", "required_tables_present", "baseline_schema_only",
        "cannot_create_public_objects", "cannot_create_schemas"), True)
    columns = ("rls_enabled", "runtime_is_not_owner", "runtime_subject_to_rls", "has_runtime_crud",
               "no_extra_table_privileges", "cannot_delegate_table_access", "anon_denied",
               "authenticated_denied", "required_sequence_access", "cannot_reset_or_delegate_sequence")
    return [role] + [{"table_name": table, **dict.fromkeys(columns, True)} for table in sorted(checker.TABLES)]


def test_target_preserves_pooler_options():
    url, options = checker.target_settings(URI, HOST, PROJECT, ROLE)
    assert url.drivername == "postgresql+psycopg"
    assert options["poolclass"] is NullPool
    assert options["connect_args"]["prepare_threshold"] is None
    assert options["connect_args"]["sslmode"] == "require"
    assert options["echo"] is False and options["hide_parameters"] is True


@pytest.mark.parametrize("uri", [
    URI.replace(HOST, "another.pooler.supabase.com"), URI.replace(":6543/", ":5432/"),
    URI.replace(ROLE, "postgres"), URI.replace(PROJECT, "b" * 20),
    URI.replace("postgres?", "other?"), URI.replace("require", "disable"),
    URI.replace(":synthetic-private", ""), URI + "&host=other.test",
    URI + "&options=-c%20role%3Dpostgres", URI + "&service=owner",
    URI.replace("postgresql:", "postgresql+psycopg2:"),
])
def test_target_refuses_wrong_identity_and_connection_overrides(uri):
    with pytest.raises(ValueError):
        checker.target_settings(uri, HOST, PROJECT, ROLE)


def test_worker_drops_inherited_database_credentials_and_driver_overrides(monkeypatch):
    for name in ("DATABASE_URL", "POSTGRES_URL", "SUPABASE_SERVICE_ROLE_KEY", "PGHOST", "PGOPTIONS", "PYTHONPATH"):
        monkeypatch.setenv(name, "private-owner-sentinel")
    result = checker.worker_environment(URI)
    assert "private-owner-sentinel" not in str(result)
    assert result["PYTHON_DOTENV_DISABLED"] == "1"
    assert result["RPL_RUNTIME_CANDIDATE_URI"] == URI


@pytest.mark.parametrize("field", ["restricted_role_attributes", "runtime_group_inherited", "owns_no_database", "baseline_schema_only"])
def test_verifier_refuses_any_failed_role_check(field):
    rows = good_rows()
    rows[0][field] = False
    with pytest.raises(ValueError):
        checker.validate_rows(rows, "baseline14")


@pytest.mark.parametrize("mutation", ["missing_table", "duplicate_table", "failed_rls", "missing_column", "numeric_true"])
def test_verifier_requires_complete_boolean_results(mutation):
    rows = good_rows()
    if mutation == "missing_table":
        rows.pop()
    elif mutation == "duplicate_table":
        rows[-1] = rows[-2]
    elif mutation == "failed_rls":
        rows[-1]["runtime_subject_to_rls"] = False
    elif mutation == "missing_column":
        del rows[-1]["anon_denied"]
    else:
        rows[0]["restricted_role_attributes"] = 1
    with pytest.raises(ValueError):
        checker.validate_rows(rows, "baseline14")


def test_valid_metadata_is_summarized_without_row_contents():
    assert checker.validate_rows(good_rows(), "baseline14") == {
        "schema": "baseline14", "tables_checked": 14, "permissions_passed": True}


def test_repair_schema_requires_both_additional_tables():
    rows = good_rows()
    del rows[0]["baseline_schema_only"]
    for table in ("reservation_confirmations", "inventory_writes"):
        rows.append({**rows[-1], "table_name": table})
    assert checker.validate_rows(rows, "repair16")["tables_checked"] == 16
    with pytest.raises(ValueError):
        checker.validate_rows(rows, "baseline14")


def test_no_implicit_owner_connection(monkeypatch):
    monkeypatch.setattr("sys.argv", ARGS)
    monkeypatch.delenv("RPL_RUNTIME_CANDIDATE_URI", raising=False)
    monkeypatch.setenv("DATABASE_URL", URI)
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    run = Mock()
    monkeypatch.setattr(checker.subprocess, "run", run)
    assert checker.main() == 1
    run.assert_not_called()


@pytest.mark.parametrize("success", [True, False])
def test_child_uses_no_secret_arguments_and_withholds_diagnostics(monkeypatch, success):
    monkeypatch.setattr("sys.argv", ARGS)
    monkeypatch.setenv("RPL_RUNTIME_CANDIDATE_URI", URI)
    output = json.dumps({"schema": "baseline14", "tables_checked": 14, "permissions_passed": True,
                         "tls_encrypted": True, "expected_login": True}) if success else URI
    run = Mock(return_value=SimpleNamespace(returncode=0 if success else 1, stdout=output, stderr=URI))
    monkeypatch.setattr(checker.subprocess, "run", run)
    with redirect_stdout(io.StringIO()) as captured:
        assert checker.main() == (0 if success else 1)
    assert URI not in str(run.call_args.args)
    assert run.call_args.kwargs["env"]["RPL_RUNTIME_CANDIDATE_URI"] == URI
    assert "synthetic-private" not in captured.getvalue()


@pytest.mark.parametrize("tls,identity", [(False, (True, True)), (True, (False, True))])
def test_failed_transport_or_identity_closes_connection_before_permission_sql(monkeypatch, tls, identity):
    raw = Mock()
    raw.driver_connection.pgconn.ssl_in_use = tls
    cursor = Mock()
    cursor.fetchone.return_value = identity
    raw.driver_connection.cursor.return_value.__enter__ = Mock(return_value=cursor)
    raw.driver_connection.cursor.return_value.__exit__ = Mock(return_value=False)
    engine = Mock()
    engine.raw_connection.return_value = raw
    monkeypatch.setattr("sqlalchemy.create_engine", Mock(return_value=engine))
    with pytest.raises(ValueError):
        checker.verify(URI, HOST, PROJECT, ROLE, "baseline14")
    assert all("has_table_privilege" not in str(call) for call in cursor.execute.call_args_list)
    raw.close.assert_called_once()
    engine.dispose.assert_called_once()
