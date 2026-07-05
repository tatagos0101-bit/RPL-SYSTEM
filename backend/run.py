"""
run.py — Start the Rizal Provincial Library backend server.

Usage:
    python run.py           # starts on http://localhost:8000
    python run.py --port 8080
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


_WEAK_SECRETS = {
    "insecure-dev-secret-change-me",
    "change-this-to-a-long-random-secret",
    "rizal-lib-super-secret-key-change-in-production",
    "secret",
    "password",
    "",
}


def check_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        from dotenv import load_dotenv
        load_dotenv(env_path, override=False)

        with open(env_path) as f:
            contents = f.read()
        # Warn if database password is still the placeholder
        if "yourpassword" in contents:
            print("WARNING: .env still contains 'yourpassword'.")
            print("  Update DATABASE_URL with your actual MySQL password before continuing.\n")
    # If no .env file, environment variables must be set in the host environment (e.g. Render)

    environment = os.environ.get("ENVIRONMENT", "development")
    jwt_secret  = os.environ.get("JWT_SECRET_KEY", "")
    lib_code    = os.environ.get("LIBRARIAN_AUTH_CODE", "")

    errors   = []
    warnings = []

    # JWT secret strength checks
    if jwt_secret in _WEAK_SECRETS:
        msg = "JWT_SECRET_KEY is a known weak/default value."
        if environment == "production":
            errors.append(msg + " This is a fatal error in production.")
        else:
            warnings.append(msg + " Generate a strong random secret before deploying.")
    elif len(jwt_secret) < 32:
        msg = f"JWT_SECRET_KEY is only {len(jwt_secret)} characters (minimum 32 recommended)."
        if environment == "production":
            errors.append(msg)
        else:
            warnings.append(msg)

    # Librarian auth code must be set
    if not lib_code or lib_code in ("change-this-to-a-secret-code", "LIB-RPL-2025"):
        msg = "LIBRARIAN_AUTH_CODE is missing or still set to a default value."
        if environment == "production":
            errors.append(msg + " This is a fatal error in production.")
        else:
            warnings.append(msg + " Set a strong code before deploying.")

    for w in warnings:
        print(f"WARNING: {w}")
    if warnings:
        print()

    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        print("\nFix the above errors before running in production.")
        sys.exit(1)


def main():
    check_env()

    port = int(os.environ.get("PORT", 8000))
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])

    # Init DB tables
    from database import init_db
    print("Initializing database tables...")
    try:
        init_db()
    except Exception as e:
        print(f"ERROR: Could not connect to database.\n  {e}")
        print("\n  Make sure MySQL is running and .env DATABASE_URL is correct.")
        sys.exit(1)
    print("[OK] Database tables ready")

    # Run schema migrations (safe to run on every startup — skips existing columns)
    from migrate import run as run_migrations
    try:
        run_migrations()
    except Exception as e:
        print(f"WARNING: Migration failed — {e}")
        print("  The server will still start but some features may not work correctly.")
    print()

    from config import ENVIRONMENT
    is_prod = ENVIRONMENT == "production"

    if is_prod:
        print(f"Starting Rizal Provincial Library API [PRODUCTION] on port {port}")
        print("  Tip: for production workloads, run behind nginx with TLS termination.")
    else:
        print(f"Starting Rizal Provincial Library API on http://localhost:{port}")
        print(f"  API docs: http://localhost:{port}/docs")
    print("  Press Ctrl+C to stop\n")

    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        # Hot-reload is useful in development but wastes memory and exposes risk in production
        reload=not is_prod,
    )


if __name__ == "__main__":
    main()
