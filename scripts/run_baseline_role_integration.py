"""Rehearse restricted roles against the frozen deployed 14-table API source.

No production connection or environment files are read. Requires the baseline
Git objects locally and the same local Docker engine as run_security_integration.
"""
import subprocess

import run_security_integration as runner

BASELINE = "897502349ae16f52209bc2d533566d2e08d3f2d1"
EXCLUDED = {
    "backend/models/inventory_write.py", "backend/services/borrowing_capacity.py",
    "backend/services/list_queries.py",
}
BASELINE_FILES = tuple(path for path in runner.FILES
                       if path.startswith(("backend/", "supabase/migrations/"))
                       and path not in EXCLUDED) + (
    "backend/routers/auth.py", "backend/routers/reservations.py", "backend/routers/reports.py",
    "backend/schemas/auth.py", "backend/schemas/reservation.py",
    "backend/logger.py", "backend/middleware/__init__.py", "backend/middleware/security.py",
    "backend/services/password_reset.py", "backend/services/report_service.py",
)
CURRENT_FILES = tuple(path for path in runner.FILES
                      if path.startswith("tests/security/") or path.startswith("supabase/operations/")) + (
    "tests/security/check_baseline_api.py", "tests/security/baseline-requirements.txt",
    "supabase/operations/prepare_runtime_role_baseline14.sql",
    "supabase/operations/check_runtime_access_baseline14.sql",
)


def stage_context(destination, root=runner.ROOT):
    root = root.resolve()
    for relative in BASELINE_FILES:
        # Exact immutable revision and explicit source allowlist; never git archive
        # an entire working tree or copy ignored uploads/environment files.
        content = subprocess.run(["git", "show", f"{BASELINE}:{relative}"], cwd=root,
                                 capture_output=True, check=True, timeout=20).stdout
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    for relative in CURRENT_FILES:
        source = root / relative
        if source.is_symlink() or not source.resolve().is_relative_to(root) or not source.is_file():
            raise RuntimeError("Unsafe or missing baseline harness source")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    (destination / "compose.yaml").write_bytes((destination / "tests/security/compose.yaml").read_bytes())
    dockerfile = destination / "tests/security/Dockerfile"
    dockerfile.write_text(dockerfile.read_text().replace(
        "COPY backend/ backend/",
        "COPY tests/security/baseline-requirements.txt /tmp/baseline-requirements.txt\n"
        "RUN pip install --no-cache-dir -r /tmp/requirements.txt -r /tmp/baseline-requirements.txt\n"
        "COPY tests/security/check_baseline_api.py tests/security/check_baseline_api.py\n"
        "COPY baseline-revision.txt baseline-revision.txt\nCOPY backend/ backend/"), encoding="utf-8")
    (destination / "baseline-revision.txt").write_text(BASELINE, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(runner.main(stage=stage_context))
