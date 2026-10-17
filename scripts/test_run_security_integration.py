import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("security_runner", ROOT / "scripts/run_security_integration.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class SecurityRunnerTests(unittest.TestCase):
    def test_context_copies_only_allowlisted_source(self):
        with tempfile.TemporaryDirectory(prefix="rpl-context-") as directory:
            root = Path(directory) / "repo"
            target = Path(directory) / "context"
            for relative in runner.FILES:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic source", encoding="utf-8")
            for relative in (".env", "backend/.env", ".tools/credentials.txt", "backend/uploads/private.txt"):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic-private-sentinel", encoding="utf-8")
            runner.stage_context(target, root)
            copied = {p.relative_to(target).as_posix() for p in target.rglob("*") if p.is_file()}
            self.assertEqual(copied, set(runner.FILES) | {"compose.yaml"})
            self.assertTrue(all("synthetic-private-sentinel" not in p.read_text()
                                for p in target.rglob("*") if p.is_file()))

    def test_missing_source_fails_closed(self):
        with tempfile.TemporaryDirectory(prefix="rpl-missing-") as directory:
            root = Path(directory)
            with self.assertRaises(RuntimeError):
                runner.stage_context(root / "context", root)

    def test_shell_cannot_override_compose_project_or_builder(self):
        with patch.dict(os.environ, {"COMPOSE_FILE": "unrelated.yaml", "COMPOSE_PROJECT_NAME": "production",
                                     "BUILDKIT_HOST": "tcp://remote", "BUILDX_BUILDER": "remote"}):
            env = runner.docker_environment()
        self.assertNotIn("COMPOSE_FILE", env)
        self.assertNotIn("COMPOSE_PROJECT_NAME", env)
        self.assertNotIn("BUILDX_BUILDER", env)
        self.assertNotIn("BUILDKIT_HOST", env)
        self.assertEqual(env["COMPOSE_DISABLE_ENV_FILE"], "true")

    def test_remote_daemon_override_is_refused_before_any_command(self):
        with patch.object(runner.subprocess, "run") as command:
            with self.assertRaises(RuntimeError):
                runner.check_local_docker("docker", {"DOCKER_HOST": "ssh://remote"})
            command.assert_not_called()

    def test_remote_context_is_refused(self):
        result = subprocess.CompletedProcess([], 0, json.dumps("tcp://remote:2376"), "")
        with patch.object(runner.subprocess, "run", return_value=result):
            with self.assertRaises(RuntimeError):
                runner.check_local_docker("docker", {})

    def test_local_linux_context_is_accepted(self):
        results = [subprocess.CompletedProcess([], 0, json.dumps("npipe:////./pipe/docker_engine"), ""),
                   subprocess.CompletedProcess([], 0, "linux\n", ""),
                   subprocess.CompletedProcess([], 0, "Compose v2", "")]
        with patch.object(runner.subprocess, "run", side_effect=results):
            runner.check_local_docker("docker", {})

    def test_unresponsive_engine_has_a_bounded_readiness_check(self):
        with patch.object(runner.subprocess, "run", side_effect=subprocess.TimeoutExpired("docker", 20)) as command:
            with self.assertRaises(subprocess.TimeoutExpired):
                runner.check_local_docker("docker", {})
            self.assertEqual(command.call_args.kwargs["timeout"], 20)

    def test_integration_requirements_match_application_lock(self):
        packages = tomllib.loads((ROOT / "backend/uv.lock").read_text())["package"]
        versions = {item["name"]: item["version"] for item in packages}
        for line in (ROOT / "tests/security/requirements.txt").read_text().splitlines():
            if line and not line.startswith("#"):
                package, version = line.split("==")
                self.assertEqual(versions[package.split("[")[0].lower()], version)


if __name__ == "__main__":
    unittest.main()
