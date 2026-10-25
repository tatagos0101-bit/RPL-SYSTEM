from unittest.mock import Mock

from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest

from scripts import runtime_workflow_probe as probe


@pytest.fixture()
def protected(monkeypatch):
    guard = Mock(return_value={})
    workflows = Mock(return_value={"workflow_checks_passed": True})
    monkeypatch.setattr(probe, "runtime_candidate_check", guard)
    monkeypatch.setattr(probe, "run_workflows", workflows)
    monkeypatch.setattr(probe, "_used", False)
    return TestClient(probe.app), guard, workflows


def test_rejected_identity_cannot_start_workflows(protected):
    client, guard, workflows = protected
    guard.side_effect = HTTPException(403, "Probe unavailable")
    assert client.get("/api/runtime-workflow-check").status_code == 403
    workflows.assert_not_called()


def test_once_only_and_no_request_sql(protected):
    client, guard, workflows = protected
    assert client.get("/api/runtime-workflow-check?sql=DELETE&uri=wrong").status_code == 200
    workflows.assert_called_once_with()
    assert client.get("/api/runtime-workflow-check").status_code == 409
    assert workflows.call_count == 1


def test_failures_are_private_and_cannot_be_retried(protected):
    client, guard, workflows = protected
    workflows.side_effect = RuntimeError("synthetic-private-password")
    response = client.get("/api/runtime-workflow-check")
    assert response.status_code == 503
    assert "synthetic-private" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/runtime-workflow-check").status_code == 409


def test_concurrent_attempt_is_rejected(protected):
    client, guard, workflows = protected
    probe._lock.acquire()
    try:
        assert client.get("/api/runtime-workflow-check").status_code == 409
        workflows.assert_not_called()
    finally:
        probe._lock.release()
