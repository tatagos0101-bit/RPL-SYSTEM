"""Opt-in acceptance, only an empty disposable localhost rpl_otp_test database."""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database import Base
from models.book import Book
from models.password_reset import PasswordResetCode
from models.user import User
from services.category_service import MASTER_KEYWORDS, reconcile_categories
from services.password_reset import consume_code, issue_code


def test_otp_migrations_and_concurrent_use(monkeypatch):
    address = os.getenv("OTP_TEST_DATABASE_URL")
    if not address:
        pytest.skip("Requires disposable localhost rpl_otp_test PostgreSQL")
    url = make_url(address)
    assert url.host in ("127.0.0.1", "localhost") and url.database == "rpl_otp_test"
    engine = create_engine(url, connect_args={"connect_timeout": 5})
    with engine.connect() as conn:
        assert not inspect(conn).get_table_names(), "Use an empty disposable database"
    Base.metadata.create_all(engine)
    root = Path(__file__).resolve().parents[2]
    try:
        with engine.begin() as conn:
            for column in ("purpose", "context_hash", "attempts", "delivered_at"):
                conn.execute(text(f"ALTER TABLE password_reset_codes DROP COLUMN {column}"))
            conn.execute(text("INSERT INTO users (id, name, role, status, password_hash, must_change_password, email_verified, phone_verified) VALUES (1, 'Synthetic', 'member', 'active', 'synthetic', false, true, false)"))
            conn.execute(text("INSERT INTO password_reset_codes (user_id, channel, code_hash, expires_at, created_at) VALUES (1, 'email', 'legacy', now()+interval '15 minutes', now()-interval '2 hours')"))
            sql = (root / "supabase/operations/contact_verification.sql").read_text(encoding="utf-8")
            conn.exec_driver_sql(sql); conn.exec_driver_sql(sql)
            assert conn.execute(text("SELECT context_hash, delivered_at, purpose, attempts FROM password_reset_codes")).one() == (None, None, "reset", 0)
            assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='password_reset_codes'::regclass")).scalar()
        with Session(engine) as db:
            user = db.get(User, 1); user.email = "synthetic@example.test"; db.commit()
            code = issue_code(db, user, "email", "verify", test_delivery=True)

        def race(function):
            barrier = Barrier(2)
            def run(_):
                with Session(engine) as db:
                    user = db.get(User, 1)
                    barrier.wait(timeout=10)
                    try:
                        function(db, user)
                        db.commit()
                        return 200
                    except HTTPException as error:
                        db.rollback()
                        return error.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                return sorted(pool.map(run, range(2)))

        assert race(lambda db, user: consume_code(db, user, code, "verify", "email")) == [200, 400]
        with Session(engine) as db:
            db.execute(text("UPDATE password_reset_codes SET created_at = now()-interval '2 hours'")); db.commit()
        assert race(lambda db, user: issue_code(db, user, "email", "verify", test_delivery=True)) == [200, 429]

        # SQL backfill and Python mapper agree; count never publishes an unknown label.
        labels = [*MASTER_KEYWORDS, *(word + " / General -- Fiction" for words in MASTER_KEYWORDS.values() for word in words),
                  "Juvenile / Fantasy", "Regency England -- Fiction", "Sci-Fi & Fantasy", "Business & Economics", "General"]
        with Session(engine) as db:
            for label in labels:
                db.add(Book(title="Synthetic", author="Synthetic", category=label, raw_api_label=label,
                            copies_total=1, copies_available=1))
            db.commit()
        with engine.begin() as conn:
            sql = (root / "supabase/operations/category_normalization.sql").read_text(encoding="utf-8")
            conn.exec_driver_sql(sql); conn.exec_driver_sql(sql)
        with Session(engine) as db:
            assert reconcile_categories(db) == 0
            assert db.query(Book).count() == len(labels)
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
