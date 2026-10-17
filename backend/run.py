"""
run.py — Start the Rizal Provincial Library backend server.

Usage:
    python run.py           # starts on http://localhost:8000
    python run.py --port 8080
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


def check_env():
    # config loads the local .env without overriding host-provided variables.
    # ASGI startup uses the same validation even when run.py is bypassed.
    from config import (
        ENVIRONMENT, JWT_SECRET_KEY, LIBRARIAN_AUTH_CODE,
        account_secret_errors, validate_deployment_config,
    )

    if ENVIRONMENT == "production":
        try:
            validate_deployment_config()
        except RuntimeError as error:
            print(f"ERROR: {error}")
            sys.exit(1)
    else:
        for warning in account_secret_errors(JWT_SECRET_KEY, LIBRARIAN_AUTH_CODE):
            print(f"WARNING: {warning}")


def main():
    check_env()

    port = int(os.environ.get("PORT", 8000))
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])

    # FastAPI startup checks database readiness; check_env makes no connection.
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
