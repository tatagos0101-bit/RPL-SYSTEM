import os
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest

import runtime_role_probe as probe


@pytest.fixture()
def protected_probe(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("AUTO_MIGRATE", "false")
    monkeypatch.setenv("RPL_AUDIT_TOKEN", "synthetic-probe-token-" + "x" * 40)
    monkeypatch.setenv("RPL_AUDIT_EXPIRES", "2000")
    monkeypatch.setattr(probe.time, "time", lambda: 1000)
    collector = Mock(return_value={"identity": {"read_only_transaction": True}, "tables": {"present_application_table_count": 16}})
    monkeypatch.setattr(probe, "collect_metadata", collector)
    return TestClient(probe.app), collector, {"Authorization": "Bearer " + os.environ["RPL_AUDIT_TOKEN"]}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}])
def test_unauthorized_requests_never_connect(protected_probe, headers):
    client, collector, _ = protected_probe
    response = client.get("/api/runtime-role-audit", headers=headers)
    assert response.status_code == 403 and response.headers["cache-control"] == "no-store"
    collector.assert_not_called()


@pytest.mark.parametrize("name,value", [
    ("ENVIRONMENT", "preview"), ("AUTO_MIGRATE", "true"), ("AUTO_MIGRATE", ""),
    ("RPL_AUDIT_TOKEN", "short"), ("RPL_AUDIT_EXPIRES", "999"),
    ("RPL_AUDIT_EXPIRES", "99999"), ("RPL_AUDIT_EXPIRES", "bad"),
])
def test_bad_configuration_never_connects(protected_probe, monkeypatch, name, value):
    client, collector, headers = protected_probe
    monkeypatch.setenv(name, value)
    assert client.get("/api/runtime-role-audit", headers=headers).status_code == 403
    collector.assert_not_called()


def test_only_fixed_metadata_collector_is_exposed(protected_probe):
    client, collector, headers = protected_probe
    response = client.get("/api/runtime-role-audit?sql=DELETE%20FROM%20users", headers=headers)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    collector.assert_called_once_with()
    assert client.get("/openapi.json").status_code == 404


def test_connection_failure_does_not_disclose_configuration(protected_probe):
    client, collector, headers = protected_probe
    collector.side_effect = RuntimeError("synthetic-private-database-password")
    response = client.get("/api/runtime-role-audit", headers=headers)
    assert response.status_code == 503 and response.headers["cache-control"] == "no-store"
    assert "synthetic-private" not in response.text
