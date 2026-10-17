"""Run disposable local PostgreSQL/Redis checks without copying environment files."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "backend/config.py", "backend/database.py", "backend/dependencies.py",
    "backend/limiter.py", "backend/timezone_utils.py", "backend/models/__init__.py",
    "backend/models/user.py", "backend/models/auth_session.py", "backend/models/book.py",
    "backend/models/book_copy.py", "backend/models/entry_log.py", "backend/models/face_embedding.py",
    "backend/models/library_settings.py", "backend/models/notification.py",
    "backend/models/password_reset.py", "backend/models/reading_goal.py",
    "backend/models/reservation.py", "backend/models/security_alert.py", "backend/models/transaction.py",
    "backend/services/auth_sessions.py", "backend/services/auth_cookie.py",
    "backend/services/database_config.py",
    "backend/services/schema_migrations.py", "backend/models/book_interaction.py",
    "backend/routers/__init__.py", "backend/routers/transactions.py",
    "backend/schemas/__init__.py", "backend/schemas/transaction.py", "backend/schemas/report.py",
    "backend/services/book_copy_service.py", "backend/services/loan_policy.py",
    "backend/services/reservation_policy.py",
    "supabase/migrations/20261010000100_library_schema.sql",
    "supabase/migrations/20261016000100_auth_sessions.sql",
    "supabase/operations/prepare_runtime_role.sql", "supabase/operations/check_runtime_access.sql",
    "tests/security/Dockerfile", "tests/security/requirements.txt", "tests/security/run_checks.py",
    "tests/security/compose.yaml",
    "tests/security/check_circulation.py",
)


def stage_context(destination, root=ROOT):
    """An explicit file allowlist, rather than trusting a broad COPY or .gitignore."""
    root = root.resolve()
    for relative in FILES:
        source = root / relative
        resolved = source.resolve()
        if source.is_symlink() or not resolved.is_relative_to(root) or not source.is_file():
            raise RuntimeError("Unsafe or missing integration source file")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    shutil.copyfile(destination / "tests/security/compose.yaml", destination / "compose.yaml")


def docker_environment():
    # Do not allow shell overrides to select another Compose file/project/builder.
    env = {k: v for k, v in os.environ.items()
           if not k.startswith("COMPOSE_") and k not in {"BUILDX_BUILDER", "BUILDKIT_HOST"}}
    env["COMPOSE_DISABLE_ENV_FILE"] = "true"
    return env


def check_local_docker(docker, env):
    override = env.get("DOCKER_HOST", "")
    if override and not override.startswith(("npipe://", "unix://")):
        raise RuntimeError("Remote Docker endpoints are not allowed for these local checks")
    result = subprocess.run([docker, "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
                            env=env, capture_output=True, text=True, check=True, timeout=20)
    endpoint = json.loads(result.stdout)
    if not endpoint.startswith(("npipe://", "unix://")):
        raise RuntimeError("Select a local Docker context before running these checks")
    result = subprocess.run([docker, "info", "--format", "{{.OSType}}"],
                            env=env, capture_output=True, text=True, check=True, timeout=20)
    if result.stdout.strip() != "linux":
        raise RuntimeError("Start Docker with Linux containers before running these checks")
    subprocess.run([docker, "compose", "version"], env=env, capture_output=True, check=True, timeout=20)


def main():
    docker = shutil.which("docker")
    if not docker:
        print("Docker is unavailable. Install/start Docker Desktop with Linux containers, then rerun this command.")
        return 2
    env = docker_environment()
    try:
        check_local_docker(docker, env)
    except (RuntimeError, subprocess.SubprocessError, ValueError):
        print("A running local Docker Linux engine and Compose are required. Remote engines are refused.")
        return 2
    project = "rpl-security-" + uuid.uuid4().hex[:12]
    assert re.fullmatch(r"rpl-security-[0-9a-f]{12}", project)
    workspace = (ROOT / ".tools" / "security-test-runs" / project).resolve()
    if not workspace.is_relative_to((ROOT / ".tools").resolve()):
        raise RuntimeError("Unsafe integration workspace")
    workspace.mkdir(parents=True, exist_ok=False)
    stage_context(workspace)
    # Explicit empty interpolation environment; never load the repository .env.
    empty_env = workspace / "empty.env"
    empty_env.write_text("", encoding="utf-8")
    command = [docker, "compose", "--env-file", str(empty_env), "-p", project,
               "-f", str(workspace / "compose.yaml")]
    print(f"Starting disposable local integration checks ({project}).")
    code = 1
    try:
        subprocess.run(command + ["config", "--quiet"], env=env, check=True)
        # Build on the local engine, not an externally selected buildx builder.
        subprocess.run(command + ["build", "--builder", "default"], env=env, check=True)
        code = subprocess.run(command + ["up", "--no-build", "--abort-on-container-exit",
                                         "--exit-code-from", "verify", "--attach", "verify"], env=env).returncode
    except (subprocess.SubprocessError, KeyboardInterrupt):
        print("Integration checks did not complete.")
    finally:
        # The unique project identifier scopes cleanup to this invocation only.
        cleanup = subprocess.run(command + ["down", "--volumes", "--remove-orphans"], env=env)
        if cleanup.returncode:
            print(f"Cleanup failed for {project}; remove only that test project before rerunning.")
            code = 1
    return code


if __name__ == "__main__":
    raise SystemExit(main())
