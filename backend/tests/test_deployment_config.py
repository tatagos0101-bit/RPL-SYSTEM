"""Synthetic configuration only; never load or connect to a deployment target."""
import pytest

import config
import run


@pytest.fixture()
def production_config(monkeypatch):
    settings = {
        "ENVIRONMENT": "production",
        "DATABASE_URL": "postgresql://example.invalid/test",
        "STORAGE_BACKEND": "supabase",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "synthetic-storage-credential",
        "JWT_SECRET_KEY": "synthetic-test-secret-with-at-least-32-characters",
        "LIBRARIAN_AUTH_CODE": "synthetic-registration-code",
        "AUTH_COOKIE_SAMESITE": "lax",
        "ALLOWED_ORIGINS": ["https://example.test"],
    }
    for name, value in settings.items():
        monkeypatch.setattr(config, name, value)


@pytest.mark.parametrize("secret", [
    "short", " " * 40, "change-this-to-a-long-random-secret",
    "rizal-lib-super-secret-key-change-in-production",
    "  rizal-lib-super-secret-key-change-in-production  ",
])
def test_asgi_and_launcher_reject_weak_secrets_without_disclosure(
    production_config, monkeypatch, capsys, secret,
):
    monkeypatch.setattr(config, "JWT_SECRET_KEY", secret)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY") as error:
        config.validate_deployment_config()
    assert secret not in str(error.value)
    with pytest.raises(SystemExit) as exit_error:
        run.check_env()
    assert exit_error.value.code == 1
    output = capsys.readouterr().out
    assert "JWT_SECRET_KEY" in output
    assert secret not in output


@pytest.mark.parametrize("code", ["", " ", "change-this-to-a-secret-code", "LIB-RPL-2025"])
def test_production_rejects_default_registration_code(production_config, monkeypatch, code):
    monkeypatch.setattr(config, "LIBRARIAN_AUTH_CODE", code)
    with pytest.raises(RuntimeError, match="LIBRARIAN_AUTH_CODE"):
        config.validate_deployment_config()


def test_nondefault_configuration_passes_both_entrypoints(production_config, capsys):
    config.validate_deployment_config()
    run.check_env()
    assert capsys.readouterr().out == ""


def test_development_warns_without_printing_values(monkeypatch, capsys):
    monkeypatch.setattr(config, "ENVIRONMENT", "development")
    monkeypatch.setattr(config, "JWT_SECRET_KEY", "synthetic-short")
    monkeypatch.setattr(config, "LIBRARIAN_AUTH_CODE", "LIB-RPL-2025")
    run.check_env()
    output = capsys.readouterr().out
    assert "WARNING: JWT_SECRET_KEY" in output
    assert "WARNING: LIBRARIAN_AUTH_CODE" in output
    assert "synthetic-short" not in output
    assert "LIB-RPL-2025" not in output
