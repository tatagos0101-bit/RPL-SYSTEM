from slowapi import Limiter
from slowapi.util import get_remote_address
from redis.backoff import NoBackoff
from redis.retry import Retry
import hmac

from config import ENVIRONMENT, JWT_SECRET_KEY, RATE_LIMIT_STORAGE_URI, RATE_LIMIT_REQUIRE_SHARED, validate_rate_limit_config


def client_limit_key(request):
    # Trust the ASGI peer address, not arbitrary forwarded headers. Confirm the
    # hosting adapter supplies distinct client addresses before enabling Redis.
    return hmac.new(JWT_SECRET_KEY.encode(),
                    f"rate-limit:{get_remote_address(request)}".encode(), "sha256").hexdigest()


def build_limiter(uri=RATE_LIMIT_STORAGE_URI, environment=ENVIRONMENT, require_shared=RATE_LIMIT_REQUIRE_SHARED):
    validate_rate_limit_config(uri, environment, require_shared)
    options = {}
    if uri:
        options = {"socket_connect_timeout": 2, "socket_timeout": 2,
                   "retry": Retry(NoBackoff(), 0)}
        if uri.startswith("rediss://"):
            options["ssl_cert_reqs"] = "required"
    return Limiter(
        key_func=client_limit_key,
        storage_uri=uri or "memory://", storage_options=options,
        key_prefix=f"rpl:{environment}",
        swallow_errors=False, in_memory_fallback_enabled=False,
    )


limiter = build_limiter()
