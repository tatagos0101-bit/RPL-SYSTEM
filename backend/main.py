import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import ALLOWED_ORIGINS, ENVIRONMENT, STORAGE_BACKEND, AUTO_MIGRATE, validate_deployment_config
from database import engine
from sqlalchemy import text
from fastapi import HTTPException
from limiter import limiter
from logger import get_logger
from middleware.security import SecurityMiddleware
# Import all models to ensure SQLAlchemy relationships are properly initialized
from models.security_alert import SecurityAlert
from routers import auth, users, books, inventory, transactions, reservations, librarian, recommendations, reports, kiosk, uploads

logger = get_logger("main")

app = FastAPI(
    title="Rizal Provincial Library API",
    version="1.0.0",
    description="Backend API for the Rizal Provincial Library System",
    # Hide interactive docs in production — remove this block if docs are needed in prod
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None if ENVIRONMENT == "production" else "/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS — must be inner layer so preflight responses carry CORS headers ──────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security middleware — outer layer, runs after CORS so it doesn't ──────────
# interfere with preflight responses.
app.add_middleware(SecurityMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(books.router)
app.include_router(inventory.router)
app.include_router(transactions.router)
app.include_router(reservations.router)
app.include_router(librarian.router)
app.include_router(recommendations.router)
app.include_router(reports.router)
app.include_router(kiosk.router)
app.include_router(uploads.router)


# ── Static files — uploaded book covers ──────────────────────────────────────
if STORAGE_BACKEND == "local":
    os.makedirs("uploads/covers", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    validate_deployment_config()
    if AUTO_MIGRATE:
        from migrate import run as run_migrations
        run_migrations()
    else:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    logger.info("Database tables ready — environment=%s https_only=%s", ENVIRONMENT, os.getenv("HTTPS_ONLY", "false"))
    logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)


@app.get("/")
def root():
    return {"status": "ok", "message": "Rizal Provincial Library API is running"}


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(503, "Database unavailable.") from None
    from services.face_service import FACE_LIB_AVAILABLE
    return {"status": "ok", "database": "connected", "storage": STORAGE_BACKEND, "dlib_available": FACE_LIB_AVAILABLE}
