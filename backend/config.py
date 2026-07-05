from dotenv import load_dotenv
import os
import sys

load_dotenv()

def _require(name: str) -> str:
    """Return env var value or abort with a clear error message."""
    value = os.getenv(name)
    if not value:
        print(f"ERROR: Required environment variable '{name}' is not set. "
              f"Copy backend/.env.example to backend/.env and fill in all values.", file=sys.stderr)
        sys.exit(1)
    return value

DATABASE_URL            = _require("DATABASE_URL")
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
