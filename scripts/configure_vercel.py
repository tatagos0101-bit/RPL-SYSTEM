"""Configure Vercel's same-origin API proxy after the backend has a public URL."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def configure(backend_url: str):
    parts = urlsplit(backend_url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}:
        raise ValueError("Provide the backend's HTTPS origin, without a path or credentials.")
    origin = backend_url.rstrip("/")
    for path in (ROOT / "vercel.json", ROOT / "frontend" / "vercel.json"):
        config = json.loads(path.read_text(encoding="utf-8"))
        config["rewrites"] = [
            {"source": "/api/:path*", "destination": f"{origin}/api/:path*"},
            {"source": "/uploads/:path*", "destination": f"{origin}/uploads/:path*"},
            {"source": "/health", "destination": f"{origin}/health"},
            {"source": "/((?!api(?:/|$)|uploads(?:/|$)|health(?:/|$)).*)", "destination": "/index.html"},
        ]
        path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print("Configured the Vercel API proxy. Leave VITE_API_URL unset in Vercel.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend_url")
    configure(parser.parse_args().backend_url)
