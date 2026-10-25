"""Temporary protected Preview; never mount in the production application."""
import threading

from fastapi import HTTPException, Request, Response
from scripts.runtime_candidate_probe import app, runtime_candidate_check, NO_STORE
from scripts.runtime_workflow_checks import run_workflows

_lock = threading.Lock()
_used = False


@app.get("/api/runtime-workflow-check")
def workflow_check(request: Request, response: Response):
    global _used
    # Existing guard verifies Preview, expiry, bearer, AUTO_MIGRATE and fixed
    # candidate identity/16-table privileges before any synthetic write.
    runtime_candidate_check(request, response)
    if not _lock.acquire(blocking=False):
        raise HTTPException(409, "Probe unavailable", headers=NO_STORE)
    try:
        if _used:
            raise HTTPException(409, "Probe unavailable", headers=NO_STORE)
        _used = True
        try:
            return run_workflows()
        except Exception:
            raise HTTPException(503, "Workflow acceptance incomplete", headers=NO_STORE) from None
    finally:
        _lock.release()
