from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from scripts import runtime_release_probe as probe


@pytest.fixture()
def candidate(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("AUTO_MIGRATE", "false")
    monkeypatch.setenv("RPL_AUDIT_TOKEN", "synthetic-" + "x" * 48)
    monkeypatch.setenv("RPL_AUDIT_EXPIRES", "2000")
    monkeypatch.setattr(probe.time, "time", lambda: 1000)
    monkeypatch.setattr(probe, "_used", False)
    identity, workflow = Mock(), Mock(return_value={"workflow_checks_passed": True})
    monkeypatch.setattr(probe, "runtime_identity", identity)
    monkeypatch.setattr(probe, "run_workflows", workflow)
    app = FastAPI()
    app.add_api_route("/health", lambda: {"status": "ok"})
    probe.install(app)
    return TestClient(app), identity, workflow, {"X-RPL-Release-Probe": "synthetic-" + "x" * 48}


def test_entire_candidate_is_protected(candidate):
    client, identity, workflow, headers = candidate
    assert client.get("/health").status_code == 403
    assert client.get("/health", headers=headers).status_code == 200
    assert client.get("/api/runtime-release-check").status_code == 403
    identity.assert_not_called()
    workflow.assert_not_called()


@pytest.mark.parametrize("name,value", [("AUTO_MIGRATE", "true"), ("VERCEL_ENV", "preview"),
    ("RPL_AUDIT_TOKEN", "short"), ("RPL_AUDIT_EXPIRES", "999"), ("RPL_AUDIT_EXPIRES", "bad")])
def test_unsafe_configuration_fails_before_connecting(candidate, monkeypatch, name, value):
    client, identity, workflow, headers = candidate
    monkeypatch.setenv(name, value)
    assert client.get("/api/runtime-release-check", headers=headers).status_code == 403
    identity.assert_not_called()
    workflow.assert_not_called()


def test_identity_failure_is_private_and_prevents_writes(candidate):
    client, identity, workflow, headers = candidate
    identity.side_effect = RuntimeError("synthetic-private-password")
    response = client.get("/api/runtime-release-check", headers=headers)
    assert response.status_code == 503 and "synthetic-private" not in response.text
    assert response.headers["cache-control"] == "no-store"
    workflow.assert_not_called()


def test_workflows_only_run_once_on_protected_full_app(candidate):
    client, identity, workflow, headers = candidate
    response = client.get("/api/runtime-release-check?sql=DELETE&uri=wrong", headers=headers)
    assert response.status_code == 200
    assert response.json()["storage_checks_passed"] is True
    identity.assert_called_once_with()
    assert workflow.call_args.kwargs["test_app"] is client.app
    assert workflow.call_args.kwargs["acceptance_hook"] is probe.storage_checks
    assert workflow.call_args.kwargs["client_headers"] == headers
    assert client.get("/api/runtime-release-check", headers=headers).status_code == 409
    workflow.assert_called_once()
