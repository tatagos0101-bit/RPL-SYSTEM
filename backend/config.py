from dotenv import load_dotenv
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

load_dotenv(Path(__file__).with_name(".env"), override=False)

def _require(name: str) -> str:
    """Return env var value or abort with a clear error message."""
    value = os.getenv(name)
    if not value:
        print(f"ERROR: Required environment variable '{name}' is not set. "
              f"Copy backend/.env.example to backend/.env and fill in all values.", file=sys.stderr)
        sys.exit(1)
    return value

DATABASE_URL            = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or _require("DATABASE_URL")
JWT_SECRET_KEY          = _require("JWT_SECRET_KEY")
JWT_ALGORITHM           = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MIN = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
ENVIRONMENT             = os.getenv("ENVIRONMENT", "development")

FINE_PER_DAY            = int(os.getenv("FINE_PER_DAY", "5"))
LOAN_DAYS               = int(os.getenv("LOAN_DAYS", "14"))
PICKUP_WINDOW_HOURS     = int(os.getenv("PICKUP_WINDOW_HOURS", "24"))

LIBRARIAN_AUTH_CODE     = os.getenv("LIBRARIAN_AUTH_CODE", "")
ENTRY_STATION_PIN       = os.getenv("ENTRY_STATION_PIN", "1234" if ENVIRONMENT != "production" else "")
ENTRY_MIN_VISIT_SECONDS = int(os.getenv("ENTRY_MIN_VISIT_SECONDS", "300"))  # 5 minutes before scan can time out
ENTRY_REENTRY_GAP_SECONDS = int(os.getenv("ENTRY_REENTRY_GAP_SECONDS", "120"))  # 2 minutes before next scan starts a new visit
ENTRY_MAX_FACES_PER_FRAME = int(os.getenv("ENTRY_MAX_FACES_PER_FRAME", "4"))

FACE_MATCH_THRESHOLD    = float(os.getenv("FACE_MATCH_THRESHOLD", "0.50"))   # legacy dlib fallback threshold
FACE_ENGINE             = os.getenv("FACE_ENGINE", "auto").strip().lower()  # auto | insightface | dlib
INSIGHTFACE_MODEL_PACK  = os.getenv("INSIGHTFACE_MODEL_PACK", "buffalo_l")
FACE_MATCH_THRESHOLD_LOGIN = float(os.getenv("FACE_MATCH_THRESHOLD_LOGIN", "0.45"))
FACE_MATCH_THRESHOLD_GATE  = float(os.getenv("FACE_MATCH_THRESHOLD_GATE", "0.40"))
FACE_MATCH_MARGIN       = float(os.getenv("FACE_MATCH_MARGIN", "0.08"))
FACE_AUTO_UPGRADE_EMBEDDINGS = os.getenv("FACE_AUTO_UPGRADE_EMBEDDINGS", "true").lower() == "true"
FACE_ENROLL_DEDUP_THRESHOLD = float(os.getenv("FACE_ENROLL_DEDUP_THRESHOLD", "0.40"))  # stricter to avoid false positives
FACE_POLL_CONFIDENCE    = 2      # how many frames must match before confirming

# ── Deployment ────────────────────────────────────────────────────────────────
# Set ENVIRONMENT=production in .env when deploying.

# Public base URL of this backend — used to build absolute cover image URLs.
# In production set this to your Render service URL, e.g.:
#   BACKEND_URL=https://rizal-library-backend.onrender.com
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")

# When true, HTTP requests are redirected to HTTPS (checked via X-Forwarded-Proto).
# Enable only after TLS is configured on your reverse proxy (nginx / Caddy).
HTTPS_ONLY  = os.getenv("HTTPS_ONLY", "false").lower() == "true"

# Comma-separated list of allowed CORS origins.
# In production set this to your actual frontend domain, e.g.:
#   ALLOWED_ORIGINS=https://library.rizalprovince.gov.ph
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# Persistent cloud storage. Production never falls back to local uploads.
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "supabase" if ENVIRONMENT == "production" else "local").lower()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_COVERS_BUCKET = os.getenv("SUPABASE_COVERS_BUCKET", "rpl-covers")
SUPABASE_AVATARS_BUCKET = os.getenv("SUPABASE_AVATARS_BUCKET", "rpl-avatars")
SUPABASE_IDS_BUCKET = os.getenv("SUPABASE_IDS_BUCKET", "rpl-ids")
STORAGE_SIGNED_URL_SECONDS = int(os.getenv("STORAGE_SIGNED_URL_SECONDS", "3600"))
AUTO_MIGRATE = os.getenv("AUTO_MIGRATE", "false" if ENVIRONMENT == "production" else "true").lower() == "true"
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax").lower()
RATE_LIMIT_STORAGE_URI = os.getenv("RATE_LIMIT_STORAGE_URI", "").strip()
RATE_LIMIT_REQUIRE_SHARED = os.getenv("RATE_LIMIT_REQUIRE_SHARED", "false").lower() == "true"


def validate_rate_limit_config(uri: str, environment: str, require_shared: bool) -> None:
    if not uri:
        if require_shared:
            raise RuntimeError("RATE_LIMIT_STORAGE_URI is required when shared rate limits are enabled.")
        return
    try:
        parts = urlsplit(uri)
        valid = (parts.scheme in {"redis", "rediss"} and parts.hostname
                 and not parts.query and not parts.fragment
                 and (parts.port is None or 0 < parts.port < 65536)
                 and (not parts.path or parts.path == "/" or parts.path[1:].isdigit()))
        if environment == "production":
            valid = valid and parts.scheme == "rediss" and bool(parts.password)
    except ValueError:
        valid = False
    if not valid:
        raise RuntimeError("RATE_LIMIT_STORAGE_URI must be a Redis URL without query/fragment; production requires authenticated rediss TLS.")


def account_secret_errors(jwt_secret: str, librarian_code: str) -> list[str]:
    """Shared launcher/ASGI checks. Diagnostics must never contain secret values."""
    weak_jwt_secrets = {
        "insecure-dev-secret-change-me",
        "change-this-to-a-long-random-secret",
        "rizal-lib-super-secret-key-change-in-production",
        "secret",
        "password",
        "",
    }
    errors = []
    normalized_secret = jwt_secret.strip()
    if (len(normalized_secret) < 32 or normalized_secret in weak_jwt_secrets
            or normalized_secret.startswith("change-this")):
        errors.append("JWT_SECRET_KEY must be a random secret of at least 32 characters, not a known default.")
    if librarian_code.strip() in {"", "change-this-to-a-secret-code", "LIB-RPL-2025"}:
        errors.append("LIBRARIAN_AUTH_CODE must be a private, non-default registration code.")
    return errors


def validate_deployment_config() -> None:
    if JWT_ALGORITHM not in {"HS256", "HS384", "HS512"}:
        raise RuntimeError("JWT_ALGORITHM must use the application's shared-secret HMAC design (HS256, HS384, or HS512).")
    validate_rate_limit_config(RATE_LIMIT_STORAGE_URI, ENVIRONMENT, RATE_LIMIT_REQUIRE_SHARED)
    if STORAGE_BACKEND not in {"local", "supabase"}:
        raise RuntimeError("STORAGE_BACKEND must be local or supabase.")
    if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
        raise RuntimeError("AUTH_COOKIE_SAMESITE must be lax, strict, or none.")
    if AUTH_COOKIE_SAMESITE == "none" and not (HTTPS_ONLY or ENVIRONMENT == "production"):
        raise RuntimeError("SameSite=None requires HTTPS and secure cookies.")
    if STORAGE_BACKEND == "supabase":
        if not SUPABASE_URL.startswith("https://") or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("Supabase Storage requires SUPABASE_URL (HTTPS) and a server-only SUPABASE_SERVICE_ROLE_KEY.")
    if ENVIRONMENT != "production":
        return
    if not DATABASE_URL.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        raise RuntimeError("Production requires a Supabase PostgreSQL DATABASE_URL.")
    if STORAGE_BACKEND != "supabase":
        raise RuntimeError("Production requires Supabase Storage; local uploads are disabled.")
    secret_errors = account_secret_errors(JWT_SECRET_KEY, LIBRARIAN_AUTH_CODE)
    if secret_errors:
        raise RuntimeError(" ".join(secret_errors))
    # Staff can set a managed PIN after startup. Kiosk verification fails closed
    # when neither a database PIN nor a safe legacy environment PIN exists.
    if not ALLOWED_ORIGINS or any(not origin.startswith("https://") for origin in ALLOWED_ORIGINS):
        raise RuntimeError("Production ALLOWED_ORIGINS must list the HTTPS frontend domains.")
