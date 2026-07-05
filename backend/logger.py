"""
logger.py — Centralized logging for the Rizal Provincial Library API.

Two log destinations:
  logs/app.log      — all application events (requests, errors, info)
  logs/security.log — auth events, access denials, suspicious traffic

Both files rotate at 10 MB and keep 5 backups.
All timestamps are in Philippines Standard Time (UTC+8 / PHT).
"""
import logging
import logging.handlers
import os
import time
from datetime import timezone, timedelta

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_FMT      = "%(asctime)s PHT [%(levelname)s] %(name)s — %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"

# Philippines Standard Time offset in seconds (+8 hours)
_PH_OFFSET_SECONDS = 8 * 3600


class _PHFormatter(logging.Formatter):
    """Logging formatter that emits timestamps in Philippines Standard Time."""

    converter = lambda self, timestamp: time.gmtime(timestamp + _PH_OFFSET_SECONDS)  # noqa: E731


def _rotating_file_handler(filename: str, level: int = logging.DEBUG) -> logging.Handler:
    handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, filename),
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=5,
        encoding="utf-8",
    )
    handler.setLevel(level)
    handler.setFormatter(_PHFormatter(_FMT, _DATE_FMT))
    return handler


def _console_handler(level: int = logging.INFO) -> logging.Handler:
    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(_PHFormatter(_FMT, _DATE_FMT))
    return handler


def get_logger(name: str) -> logging.Logger:
    """Return a named application logger (app.log + console)."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        logger.addHandler(_rotating_file_handler("app.log"))
        logger.addHandler(_console_handler())
        logger.propagate = False
    return logger


# ── Dedicated security logger — written to its own file ──────────────────────

security_logger = logging.getLogger("security")
if not security_logger.handlers:
    security_logger.setLevel(logging.DEBUG)
    security_logger.addHandler(_rotating_file_handler("security.log", level=logging.INFO))
    security_logger.addHandler(_console_handler(level=logging.WARNING))
    security_logger.propagate = False
