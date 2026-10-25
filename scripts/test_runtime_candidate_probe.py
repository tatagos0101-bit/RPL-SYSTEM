import os
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest

from scripts import runtime_candidate_probe as probe


@pytest.fixture()
def protected_probe(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("AUTO_MIGRATE", "false")
    monkeypatch.setenv("RPL_AUDIT_TOKEN", "synthetic-" + "x" * 48)
    monkeypatch.setenv("RPL_AUDIT_EXPIRES", "2000")
    monkeypatch.setattr(probe.time, "time", lambda: 1000)
    collector = Mock(return_value=dict(probe.EXPECTED))
    monkeypatch.setattr(probe, "collect_metadata", collector)
    return TestClient(probe.app), collector, {"Authorization": "Bearer " + os.environ["RPL_AUDIT_TOKEN"]}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}])
def test_unauthorized_requests_never_connect(protected_probe, headers):
    client, collector, _ = protected_probe
    response = client.get("/api/runtime-candidate-check", headers=headers)
    assert response.status_code == 403 and response.headers["cache-control"] == "no-store"
    collector.assert_not_called()


@pytest.mark.parametrize("name,value", [
    ("VERCEL_ENV", "production"), ("VERCEL_ENV", "development"),
    ("AUTO_MIGRATE", "true"), ("RPL_AUDIT_TOKEN", "short"),
    ("RPL_AUDIT_EXPIRES", "999"), ("RPL_AUDIT_EXPIRES", "99999"),
    ("RPL_AUDIT_EXPIRES", "bad"),
])
def test_bad_configuration_never_connects(protected_probe, monkeypatch, name, value):
    client, collector, headers = protected_probe
    monkeypatch.setenv(name, value)
    assert client.get("/api/runtime-candidate-check", headers=headers).status_code == 403
    collector.assert_not_called()


def test_fixed_collector_and_sanitized_failure(protected_probe):
    client, collector, headers = protected_probe
    response = client.get("/api/runtime-candidate-check?sql=DELETE&uri=wrong", headers=headers)
    assert response.json() == probe.EXPECTED
    collector.assert_called_once_with()
    collector.side_effect = RuntimeError("synthetic-private-password")
    response = client.get("/api/runtime-candidate-check", headers=headers)
    assert response.status_code == 503 and "synthetic-private" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/openapi.json").status_code == 404


def test_verifier_receives_only_candidate_and_drops_connection_overrides(monkeypatch):
    uri = "postgresql://rpl_api_runtime.quzhxkgkdrctiosyjxcr:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
    monkeypatch.setenv("RPL_RUNTIME_CANDIDATE_URI", uri)
    monkeypatch.setenv("DATABASE_URL", "synthetic-owner-secret")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-storage-secret")
    monkeypatch.setenv("PGOPTIONS", "synthetic-role-override")
    run = Mock(return_value=dict(probe.EXPECTED))
    monkeypatch.setattr(probe, "verify", run)
    assert probe.collect_metadata() == probe.EXPECTED
    args, kwargs = run.call_args
    assert args[0] == uri
    assert args[1:] == (probe.POOLER_HOST, "quzhxkgkdrctiosyjxcr", "rpl_api_runtime", "repair16")
    assert probe.EXPECTED["tables_checked"] == 16
    assert "DATABASE_URL" not in os.environ
    assert "SUPABASE_SERVICE_ROLE_KEY" not in os.environ
    assert "PGOPTIONS" not in os.environ
    run.return_value = {"permissions_passed": True}
    with pytest.raises(ValueError):
        probe.collect_metadata()


def test_no_owner_fallback_or_arbitrary_host(monkeypatch):
    run = Mock()
    monkeypatch.setattr(probe, "verify", run)
    monkeypatch.delenv("RPL_RUNTIME_CANDIDATE_URI", raising=False)
    monkeypatch.setenv("DATABASE_URL", "synthetic-owner-secret")
    with pytest.raises(Exception):
        probe.collect_metadata()
    monkeypatch.setenv("RPL_RUNTIME_CANDIDATE_URI", "postgresql://rpl_api_runtime.quzhxkgkdrctiosyjxcr:synthetic@attacker.example:6543/postgres")
    with pytest.raises(probe.CandidateFailure):
        probe.collect_metadata()
    run.assert_not_called()


def test_verifier_failure_only_exposes_allowlisted_category_and_stage(protected_probe):
    client, collector, headers = protected_probe
    collector.side_effect = probe.VerificationFailure("synthetic-secret", "synthetic-secret")
    response = client.get("/api/runtime-candidate-check", headers=headers)
    assert response.status_code == 503
    assert response.json()["detail"] == {"category": "internal", "stage": "unknown", "diagnostic": {"kind": "other", "sqlstate": "none", "reason": "unclassified"}}


def test_config_diagnostic_is_protected_and_only_returns_booleans(protected_probe, monkeypatch):
    client, collector, headers = protected_probe
    monkeypatch.setenv("RPL_RUNTIME_CANDIDATE_URI", "postgresql://wrong:synthetic-secret@host.example:5432/other")
    assert client.get("/api/runtime-candidate-config").status_code == 403
    response = client.get("/api/runtime-candidate-config", headers=headers)
    checks = response.json()["configuration_checks"]
    assert all(type(value) is bool for value in checks.values())
    assert checks["username"] is False and checks["port"] is False
    assert "synthetic-secret" not in response.text
    collector.assert_not_called()


def test_packaging_check_uses_checker_root_when_probe_is_imported(protected_probe, monkeypatch, tmp_path):
    client, collector, headers = protected_probe
    monkeypatch.setattr(probe, "__file__", str(tmp_path / "scripts/runtime_candidate_probe.py"))
    response = client.get("/api/runtime-candidate-config", headers=headers)
    assert response.json()["setup_checks"]["checker_file"] is True
    collector.assert_not_called()
