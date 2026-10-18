"""Real PostgreSQL/Redis checks, restricted to the disposable Compose network."""
import importlib
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor
import uuid

ROOT = Path(__file__).resolve().parents[2]
TABLES = (
    "users", "auth_sessions", "books", "book_copies", "book_interactions", "transactions", "reservations",
    "reservation_confirmations", "inventory_writes", "notifications", "entry_logs", "reading_goals", "face_embeddings",
    "password_reset_codes", "security_alerts", "library_settings",
)


def main():
    if (os.getenv("RPL_SECURITY_TEST_ONLY") != "1"
            or os.getenv("DATABASE_URL") != "postgresql+psycopg://rpl_security_login@postgres/rpl_security_test"
            or Path("/workspace") != ROOT or (ROOT / "backend/.env").exists()):
        print("Refusing to run outside the isolated security-test container.")
        return 2
    import psycopg
    from psycopg import sql
    admin = None
    runtime = None
    stage = "fresh isolated database"
    try:
        admin = psycopg.connect(host="postgres", dbname="rpl_security_test", user="postgres",
                               connect_timeout=5, autocommit=True)
        assert admin.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0] == 0
        admin.execute("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN")
        admin.execute((ROOT / "supabase/migrations/20261010000100_library_schema.sql").read_text())
        admin.execute("""
            INSERT INTO users (name, password_hash, role, status, must_change_password, email_verified, phone_verified)
            VALUES ('Synthetic member', 'synthetic-hash-before-reset', 'member', 'active', false, true, false);
            INSERT INTO books (title, author, category, copies_total, copies_available)
            VALUES ('Synthetic book', 'Synthetic author', 'Test', 1, 1);
            INSERT INTO book_copies (book_id, copy_number, qr_code, status)
            VALUES (1, 1, 'SYNTHETIC-COPY-001', 'available');
            INSERT INTO transactions (user_id, book_id, copy_id, type, status)
            VALUES (1, 1, 1, 'borrow', 'returned');
            INSERT INTO reservations (user_id, book_id, status, queue_position)
            VALUES (1, 1, 'pending', 1);
        """)
        snapshot = admin.execute("""SELECT u.email_verified, u.phone_verified,
            t.type, t.status, t.borrow_date, t.copy_id, r.status, r.queue_position
            FROM users u JOIN transactions t ON t.user_id=u.id
            JOIN reservations r ON r.user_id=u.id WHERE u.id=1""").fetchone()
        stage = "repeatable migration and runtime-role provisioning"
        sys.path.insert(0, str(ROOT / "backend"))
        import database
        from sqlalchemy import create_engine
        runtime_engine = database.engine
        owner_engine = create_engine("postgresql+psycopg://postgres@postgres/rpl_security_test")
        try:
            database.engine = owner_engine
            database.init_db()
            database.init_db()
        finally:
            database.engine = runtime_engine
            owner_engine.dispose()
        for _ in range(2):
            admin.execute((ROOT / "supabase/migrations/20261016000100_auth_sessions.sql").read_text())
            admin.execute((ROOT / "supabase/operations/prepare_runtime_role.sql").read_text())
        preserved = admin.execute("""SELECT u.email_verified, u.phone_verified,
            t.type, t.status, t.borrow_date, t.copy_id, r.status, r.queue_position
            FROM users u JOIN transactions t ON t.user_id=u.id
            JOIN reservations r ON r.user_id=u.id WHERE u.id=1""").fetchone()
        assert snapshot == preserved
        print("PASS: repeatable additive upgrade preserves contacts, returned-loan history, copy identity, and reservation state")
        admin.execute("""CREATE ROLE rpl_security_login LOGIN INHERIT NOSUPERUSER NOCREATEDB
            NOCREATEROLE NOBYPASSRLS NOREPLICATION;
            GRANT rpl_app_runtime TO rpl_security_login""")
        runtime = psycopg.connect(host="postgres", dbname="rpl_security_test", user="rpl_security_login",
                                 connect_timeout=5, autocommit=True)
        stage = "runtime metadata and browser-role denial"
        cursor = runtime.execute((ROOT / "supabase/operations/check_runtime_access.sql").read_text())
        tables_checked = 0
        while True:
            if cursor.description:
                for row in cursor.fetchall():
                    if isinstance(row[0], str):
                        assert row[0] in TABLES and all(value is True for value in row[1:])
                        tables_checked += 1
                    else:
                        assert all(value is True for value in row)
            if not cursor.nextset():
                break
        assert tables_checked == len(TABLES)
        print("PASS: runtime attributes and all application-table grant checks")
        return verify_permissions_and_services(admin, runtime, psycopg, sql)
    except Exception as error:
        # Connection/SQL exception strings can contain credentials or parameters.
        print(f"FAIL: {stage} ({type(error).__name__}); details withheld")
        return 1
    finally:
        if runtime is not None:
            runtime.close()
        if admin is not None:
            admin.close()


def expect_denied(connection, statement, error_type):
    try:
        connection.execute(statement)
    except error_type:
        return
    raise AssertionError("Expected operation to be denied")


def verify_permissions_and_services(admin, runtime, psycopg, sql):
    stage = "browser-role access denial"
    try:
        for role in ("anon", "authenticated"):
            with psycopg.connect(host="postgres", dbname="rpl_security_test", user="postgres",
                                 connect_timeout=5, autocommit=True) as browser:
                browser.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
                for table in TABLES:
                    for statement in (
                        sql.SQL("SELECT 1 FROM public.{} LIMIT 0").format(sql.Identifier(table)),
                        sql.SQL("DELETE FROM public.{} WHERE false").format(sql.Identifier(table)),
                        sql.SQL("INSERT INTO public.{} DEFAULT VALUES").format(sql.Identifier(table)),
                    ):
                        expect_denied(browser, statement, psycopg.errors.InsufficientPrivilege)
        print("PASS: anonymous and authenticated browser roles cannot access application tables")
        stage = "runtime CRUD, constraints, and prohibited administration"
        row = runtime.execute("INSERT INTO books (title, author, category, copies_total, copies_available) VALUES ('Synthetic extra', 'Test', 'Test', 1, 1) RETURNING id").fetchone()
        runtime.execute("UPDATE books SET title='Synthetic updated' WHERE id=%s", row)
        assert runtime.execute("SELECT title FROM books WHERE id=%s", row).fetchone()[0] == "Synthetic updated"
        runtime.execute("DELETE FROM books WHERE id=%s", row)
        for statement in (
            "CREATE TABLE public.not_allowed (id integer)", "TRUNCATE public.auth_sessions",
            "ALTER TABLE public.auth_sessions ADD COLUMN not_allowed integer",
            "CREATE ROLE not_allowed", "SET ROLE postgres",
        ):
            expect_denied(runtime, statement, psycopg.errors.InsufficientPrivilege)
        expect_denied(runtime, "INSERT INTO book_copies (book_id,copy_number,qr_code,status) VALUES (1,2,'SYNTHETIC-COPY-001','available')", psycopg.errors.UniqueViolation)
        expect_denied(runtime, "INSERT INTO auth_sessions VALUES ('fake',999999,'fake',now(),now())", psycopg.errors.ForeignKeyViolation)
        admin.execute("ALTER POLICY rpl_backend_access ON public.users USING (false) WITH CHECK (false)")
        try:
            assert runtime.execute("SELECT count(*) FROM users").fetchone()[0] == 0
        finally:
            admin.execute("ALTER POLICY rpl_backend_access ON public.users USING (true) WITH CHECK (true)")
        assert runtime.execute("SELECT count(*) FROM users").fetchone()[0] == 1
        print("PASS: runtime CRUD/sequences work; constraints, RLS, and administrative denials are enforced")
        stage = "PostgreSQL session lifecycle and row locks"
        sys.path.insert(0, str(ROOT / "backend"))
        for module in ("user", "auth_session", "book", "book_copy", "entry_log", "face_embedding",
                       "library_settings", "notification", "password_reset", "reading_goal",
                       "reservation", "security_alert", "transaction", "book_interaction"):
            importlib.import_module(f"models.{module}")
        from database import SessionLocal
        from models.user import User
        from models.auth_session import AuthSession
        from services.auth_sessions import create_session_token, session_claims, session_is_current, revoke_token_session
        with SessionLocal() as db:
            user = db.get(User, 1)
            first, second = create_session_token(db, user), create_session_token(db, user)
            db.commit()
            first_id, second_id = session_claims(first)[1], session_claims(second)[1]
            assert session_is_current(db.get(AuthSession, first_id), user)
            revoke_token_session(db, first)
            db.commit()
            assert db.get(AuthSession, first_id) is None
            assert session_is_current(db.get(AuthSession, second_id), user)
            user.password_hash = "synthetic-hash-after-reset"
            db.commit()
            assert not session_is_current(db.get(AuthSession, second_id), user)
        with psycopg.connect(host="postgres", dbname="rpl_security_test", user="rpl_security_login") as lock:
            lock.execute("SELECT id FROM users WHERE id=1 FOR UPDATE")
            runtime.execute("SET lock_timeout='200ms'")
            expect_denied(runtime, "SELECT id FROM users WHERE id=1 FOR UPDATE", psycopg.errors.LockNotAvailable)
            runtime.execute("SET lock_timeout=0")
            lock.rollback()
        print("PASS: real PostgreSQL session revocation/password binding and competing row locks")
        stage = "concurrent circulation and inventory consistency"
        from check_circulation import verify_circulation
        verify_circulation(admin)
        stage = "shared Redis counters and outage behavior"
        from limits import parse
        from redis.exceptions import RedisError
        from limiter import build_limiter
        first = build_limiter("redis://redis:6379/0", "test", True)
        second = build_limiter("redis://redis:6379/0", "test", True)
        scope = uuid.uuid4().hex
        limit = parse("7/minute")
        def hit(index):
            instance = first if index % 2 else second
            return instance._limiter.hit(limit, instance._key_prefix, scope, "synthetic-client", "login")
        with ThreadPoolExecutor(max_workers=8) as pool:
            assert sum(pool.map(hit, range(30))) == 7
        assert not hit(0)
        assert first._limiter.hit(limit, first._key_prefix, scope, "other-client", "login")
        assert second._limiter.hit(limit, second._key_prefix, scope, "synthetic-client", "kiosk")
        unavailable = build_limiter("redis://redis:1/0", "test", True)
        try:
            unavailable._limiter.hit(limit, scope, "synthetic-client", "login")
        except RedisError:
            assert not unavailable._in_memory_fallback_enabled and not unavailable._swallow_errors
        else:
            raise AssertionError("Redis outage must not allow the request")
        print("PASS: two independent limiters share atomic Redis counters; client/route separation and outage rejection")
        print("PASS: all isolated PostgreSQL/Redis checks completed; no live Supabase/Vercel resources used")
        return 0
    except Exception as error:
        print(f"FAIL: {stage} ({type(error).__name__}); details withheld")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
