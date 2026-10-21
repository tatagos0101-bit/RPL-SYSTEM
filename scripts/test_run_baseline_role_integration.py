"""Safety and provenance of the source-only baseline rehearsal bundle."""
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import run_baseline_role_integration as baseline


class BaselineRunnerTests(unittest.TestCase):
    def test_stages_exact_baseline_source_without_private_or_repair_files(self):
        with tempfile.TemporaryDirectory(prefix="rpl-baseline-context-") as directory:
            target = Path(directory)
            baseline.stage_context(target)
            allowed = set(baseline.BASELINE_FILES) | set(baseline.CURRENT_FILES) | {
                "compose.yaml", "baseline-revision.txt"}
            self.assertEqual({p.relative_to(target).as_posix() for p in target.rglob("*") if p.is_file()}, allowed)
            for relative in baseline.BASELINE_FILES:
                expected = subprocess.check_output(["git", "show", f"{baseline.BASELINE}:{relative}"], cwd=baseline.runner.ROOT)
                self.assertEqual((target / relative).read_bytes(), expected, relative)
            self.assertFalse((target / "backend/models/inventory_write.py").exists())
            self.assertFalse((target / "backend/services/anti_spoof_service.py").exists())
            self.assertEqual((target / "baseline-revision.txt").read_text(), baseline.BASELINE)

    def test_missing_baseline_object_fails_without_worktree_fallback(self):
        with tempfile.TemporaryDirectory(prefix="rpl-baseline-missing-") as directory:
            with patch.object(baseline.subprocess, "run", side_effect=subprocess.CalledProcessError(128, "git")):
                with self.assertRaises(subprocess.CalledProcessError):
                    baseline.stage_context(Path(directory))
            self.assertFalse(list(Path(directory).rglob("*.py")))

    def test_pins_match_baseline_lock_including_shared_harness_requirements(self):
        lock = tomllib.loads(subprocess.check_output(
            ["git", "show", f"{baseline.BASELINE}:backend/uv.lock"], cwd=baseline.runner.ROOT).decode())
        versions = {item["name"]: item["version"] for item in lock["package"]}
        for filename in ("requirements.txt", "baseline-requirements.txt"):
            for line in (baseline.runner.ROOT / "tests/security" / filename).read_text().splitlines():
                if line and not line.startswith("#"):
                    name, version = line.split("==")
                    self.assertEqual(versions[name.split("[")[0].lower()], version)


if __name__ == "__main__":
    unittest.main()
