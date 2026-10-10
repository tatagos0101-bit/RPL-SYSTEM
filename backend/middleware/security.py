"""
middleware/security.py — Security middleware for the Rizal Provincial Library API.

Responsibilities:
  1. HTTPS enforcement  — redirect HTTP → HTTPS when HTTPS_ONLY=true
  2. Security headers   — applied to every response to prevent common browser attacks
  3. HSTS               — added in production to enforce HTTPS at the browser level
  4. Request logging    — every request logged with IP, method, path, status, latency
  5. Anomaly flagging   — 401/403/5xx and probe-style URLs written to security.log
"""
import time
import ipaddress

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response, JSONResponse

from config import ENVIRONMENT, HTTPS_ONLY
from logger import get_logger, security_logger

logger = get_logger("middleware.security")

# Headers applied to every response
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",           # block MIME-type sniffing
    "X-Frame-Options": "DENY",                     # block clickjacking
    "X-XSS-Protection": "1; mode=block",           # legacy XSS filter (IE/old Chrome)
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(self)",
    "Cache-Control": "no-store",                   # prevent sensitive data caching
}

# Substrings in the raw URL that strongly suggest scanning / probing
_PROBE_SIGNALS = (
    "../", "..\\",
    "etc/passwd", "etc/shadow",
    "wp-admin", "wp-login", "phpMyAdmin", "phpmyadmin",
    ".env", ".git/",
    "cmd.exe", "powershell",
    "eval(", "<script",
    "union+select", "union select", "' or '1'='1",
    "base64_decode",
)


def _client_ip(request: Request) -> str:
    """Return the real client IP, respecting X-Forwarded-For from a trusted proxy."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    candidate = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "unknown")
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return "unknown"


def _log_path(request: Request) -> str:
    # Prefer the route template: arbitrary path text may itself contain secrets.
    route = request.scope.get("route")
    return getattr(route, "path", "<unmatched>")


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        ip   = _client_ip(request)
        path = _log_path(request)

        # ── 1. HTTPS enforcement ──────────────────────────────────────────────
        if HTTPS_ONLY:
            proto = request.headers.get("X-Forwarded-Proto", "http")
            if proto != "https":
                https_url = str(request.url).replace("http://", "https://", 1)
                security_logger.info("HTTPS_REDIRECT ip=%s", ip)
                return RedirectResponse(url=https_url, status_code=301)

        # ── 2. Probe / scanning detection ─────────────────────────────────────
        raw_url = str(request.url).lower()
        if any(sig in raw_url for sig in _PROBE_SIGNALS):
            security_logger.warning(
                "PROBE_DETECTED ip=%s method=%s",
                ip, request.method,
            )

        # ── 3. Process the request and measure wall-clock time ────────────────
        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            logger.error(
                "UNHANDLED_EXCEPTION ip=%s method=%s path=%s error_type=%s",
                ip, request.method, _log_path(request), type(exc).__name__,
            )
            # Avoid host tracebacks containing SQL parameters or credentials.
            response = JSONResponse(status_code=500, content={"detail": "Internal server error."})

        path = _log_path(request)

        elapsed_ms = (time.perf_counter() - start) * 1000
        status     = response.status_code

        # ── 4. Request logging ────────────────────────────────────────────────
        log_fn = logger.warning if status >= 400 else logger.info
        log_fn(
            "%s %s %d %.1fms ip=%s",
            request.method, path, status, elapsed_ms, ip,
        )

        # ── 5. Anomaly flagging ───────────────────────────────────────────────
        if status == 401:
            security_logger.warning(
                "AUTH_FAILURE ip=%s method=%s path=%s", ip, request.method, path
            )
        elif status == 403:
            security_logger.warning(
                "FORBIDDEN ip=%s method=%s path=%s", ip, request.method, path
            )
        elif status == 429:
            security_logger.warning(
                "RATE_LIMITED ip=%s method=%s path=%s", ip, request.method, path
            )
        elif status >= 500:
            security_logger.error(
                "SERVER_ERROR ip=%s method=%s path=%s status=%d",
                ip, request.method, path, status,
            )

        # ── 6. Apply security headers ─────────────────────────────────────────
        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value

        if ENVIRONMENT == "production":
            # HSTS: tell browsers to always use HTTPS for 2 years
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )

        return response
