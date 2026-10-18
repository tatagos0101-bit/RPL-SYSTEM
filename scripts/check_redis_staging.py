"""Check an explicitly selected staging Redis without reading application secrets.

Uses only random, minute-lived synthetic counters. Never flushes the database.
Run with the backend Python environment; provide credentials through the hidden
prompt or RPL_REDIS_STAGING_URI, never command-line arguments.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import getpass
import logging
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import urlsplit


def worker_environment(uri):
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    environment.update({
        "PYTHON_DOTENV_DISABLED": "1",
        "DATABASE_URL": "sqlite+pysqlite://",
        "JWT_SECRET_KEY": secrets.token_hex(32),
        "LIBRARIAN_AUTH_CODE": "synthetic-staging-check",
        "ENVIRONMENT": "test", "STORAGE_BACKEND": "local",
        "AUTO_MIGRATE": "false", "RATE_LIMIT_STORAGE_URI": "",
        "RATE_LIMIT_REQUIRE_SHARED": "false", "RPL_REDIS_STAGING_URI": uri,
    })
    return environment


def validate_target(uri, expected_host):
    try:
        parts = urlsplit(uri)
        valid = (parts.scheme == "rediss" and parts.hostname == expected_host.lower()
                 and bool(parts.password) and not parts.query and not parts.fragment
                 and (parts.port is None or 0 < parts.port < 65536))
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Target must match the staging hostname and use authenticated rediss without overrides.")


def verify():
    logging.disable(logging.CRITICAL)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    from limiter import build_limiter
    from limits import parse

    uri = os.environ["RPL_REDIS_STAGING_URI"]
    first, second = (build_limiter(uri, "production", True) for _ in range(2))
    namespace = "rpl-staging-check:" + secrets.token_hex(16)
    limit = parse("7/minute")

    def hit(index):
        instance = first if index % 2 else second
        return instance._limiter.hit(limit, namespace, "synthetic-a", "login")

    with ThreadPoolExecutor(max_workers=4) as pool:
        accepted = sum(pool.map(hit, range(20)))
    if accepted != 7 or hit(0):
        raise RuntimeError("Shared counter check failed")
    if not first._limiter.hit(limit, namespace, "synthetic-b", "login"):
        raise RuntimeError("Client separation check failed")
    if not second._limiter.hit(limit, namespace, "synthetic-a", "kiosk"):
        raise RuntimeError("Route separation check failed")
    expiry = first._storage.get_expiry(limit.key_for(namespace, "synthetic-a", "login"))
    if not 0 < expiry - time.time() <= 61:
        raise RuntimeError("Counter expiry check failed")
    print("PASS: authenticated TLS, shared atomic counters, client/route separation, expiring synthetic keys")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging-host", help="Required exact hostname of a dedicated staging service")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not args.staging_host:
        parser.error("--staging-host is required; never select a production service")
    if args.worker:
        try:
            uri = os.environ.get("RPL_REDIS_STAGING_URI", "")
            validate_target(uri, args.staging_host)
            environment = worker_environment(uri)
            os.environ.clear()
            os.environ.update(environment)
            verify()
        except Exception:
            print("FAIL: staging Redis check; connection and exception details withheld")
            return 1
        return 0
    uri = os.environ.get("RPL_REDIS_STAGING_URI")
    if not uri:
        if not sys.stdin.isatty():
            print("FAIL: provide RPL_REDIS_STAGING_URI through a secure environment or use an interactive hidden prompt")
            return 1
        uri = getpass.getpass("Dedicated staging rediss URI (hidden): ")
    try:
        validate_target(uri, args.staging_host)
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--worker",
                                 "--staging-host", args.staging_host],
                                env=worker_environment(uri), capture_output=True, text=True, timeout=60)
    except (ValueError, subprocess.SubprocessError):
        print("FAIL: staging target validation or worker execution; details withheld")
        return 1
    if result.returncode or not result.stdout.startswith("PASS:"):
        print("FAIL: staging Redis check; connection and exception details withheld")
        return 1
    print("PASS: authenticated TLS, shared atomic counters, client/route separation, expiring synthetic keys")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
