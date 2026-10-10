"""SQLAlchemy settings for local development and Supabase's Postgres pooler."""
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool


def engine_settings(database_url: str, *, production: bool = False) -> tuple:
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    options = {"pool_pre_ping": True, "echo": False}
    if url.get_backend_name() == "postgresql":
        # Marketplace URLs can include client/analytics query options that are
        # not valid libpq parameters. Keep actual PostgreSQL options such as SSL.
        url = url.difference_update_query(["supa", "pgbouncer", "connection_limit", "pool_timeout"])
        connect_args = {"connect_timeout": 10}
        # Supabase transaction pooling cannot retain connection/session state.
        if url.drivername == "postgresql+psycopg":
            connect_args["prepare_threshold"] = None
        if production or (url.host and url.host.endswith("supabase.com")) or (url.host and url.host.endswith("supabase.co")):
            if url.query.get("sslmode", "require") not in {"require", "verify-ca", "verify-full"}:
                raise ValueError("Cloud PostgreSQL connections require SSL.")
            connect_args["sslmode"] = url.query.get("sslmode", "require")
        options.update(poolclass=NullPool, connect_args=connect_args)
    elif url.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False}
    else:
        options["pool_recycle"] = 3600
    return url, options
