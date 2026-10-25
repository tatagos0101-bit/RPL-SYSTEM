"""Configure Vercel's same-origin API proxy after the backend has a public URL."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def configure(backend_url: str):
    parts = urlsplit(backend_url)
    if (any(character.isspace() or character in "'\";," for character in backend_url)
            or parts.scheme != "https" or not parts.hostname or parts.username
            or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}):
        raise ValueError("Provide the backend's HTTPS origin, without a path or credentials.")
    origin = backend_url.rstrip("/")
    for path in (ROOT / "vercel.json", ROOT / "frontend" / "vercel.json"):
        config = json.loads(path.read_text(encoding="utf-8"))
        previous_api = next((rule["destination"] for rule in config.get("rewrites", [])
                             if rule.get("source") == "/api/:path*"), "")
        previous_parts = urlsplit(previous_api)
        previous_origin = f"{previous_parts.scheme}://{previous_parts.netloc}"
        # Keep the direct API allowlist aligned with the proxy without broadening
        # script/image policies or dropping the Storage and ISBN lookup origins.
        for rule in config.get("headers", []):
            for header in rule.get("headers", []):
                if header.get("key", "").lower() != "content-security-policy":
                    continue
                directives = [item.strip().split() for item in header["value"].split(";") if item.strip()]
                for directive in directives:
                    if directive[0] == "connect-src":
                        directive[1:] = [origin if source == previous_origin else source for source in directive[1:]]
                        if origin not in directive[1:]:
                            directive.append(origin)
                header["value"] = "; ".join(" ".join(item) for item in directives)
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
