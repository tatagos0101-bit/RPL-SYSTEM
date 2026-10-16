"""Opt-in integration test against a disposable local database, never Supabase.

Set RECOMMENDATION_TEST_DATABASE_URL to the localhost database
`rpl_recommendation_test`. This test owns that database's public schema.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import perf_counter

import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

import database
from database import Base
from models.book import Book
from models.book_interaction import BookInteraction
from models.transaction import Transaction
from models.user import User
from services.book_interactions import update_interaction
from services.recommendation import get_recommendations
from timezone_utils import now_ph


def test_postgres_upgrade_concurrency_security_and_performance(monkeypatch):
    address = os.environ.get("RECOMMENDATION_TEST_DATABASE_URL")
    if not address:
        pytest.skip("Requires an explicitly configured disposable local PostgreSQL database")
    url = make_url(address)
    assert url.host in {"127.0.0.1", "localhost"}
    assert url.database == "rpl_recommendation_test"
    engine = create_engine(url)
    monkeypatch.setattr(database, "engine", engine)
    try:
        with engine.begin() as conn:
            # Safety: refuse to touch any database that already contains tables.
            assert not inspect(conn).get_table_names(schema="public"), "Use an empty disposable database"
            for role in ("anon", "authenticated"):
                if not conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}).scalar():
                    conn.execute(text(f"CREATE ROLE {role} NOLOGIN"))
            # Simulate an upgrade from before feedback tracking and new indexes.
            Base.metadata.create_all(conn, tables=[t for t in Base.metadata.sorted_tables
                                                    if t.name != "book_interactions"])
            conn.execute(text("DROP INDEX ix_transactions_recommendation_history"))
            conn.execute(text("DROP INDEX ix_reservations_member_status_book"))
            conn.execute(text("GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated"))
        with Session(engine) as db:
            db.add(User(id=1, name="Synthetic existing member", role="member", password_hash="unused"))
            db.add(Book(id=1, title="Existing synthetic book", author="Synthetic", category="History", copies_total=1, copies_available=1))
            db.commit()
            db.add(Transaction(user_id=1, book_id=1, type="return", status="returned"))
            db.commit()
        database.init_db()
        database.init_db()
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM transactions")).scalar() == 1
            assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.book_interactions'::regclass")).scalar()
            for role in ("anon", "authenticated"):
                for permission in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                    assert not conn.execute(text("SELECT has_table_privilege(:role, 'public.book_interactions', :permission)"),
                                            {"role": role, "permission": permission}).scalar()
            assert "ix_transactions_recommendation_history" in {i["name"] for i in inspect(conn).get_indexes("transactions")}
            assert "ix_reservations_member_status_book" in {i["name"] for i in inspect(conn).get_indexes("reservations")}
            assert "ix_book_interactions_book_user" in {i["name"] for i in inspect(conn).get_indexes("book_interactions")}

        for favorite in (True, False):
            barrier = Barrier(2)
            def write(changes):
                with Session(engine) as db:
                    barrier.wait(timeout=10)
                    update_interaction(db, 1, 1, **changes)
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(write, changes) for changes in ({"favorite": favorite}, {"viewed": True})]
                for future in futures:
                    future.result(timeout=15)
            with Session(engine) as db:
                feedback = db.get(BookInteraction, (1, 1))
                assert feedback.is_favorite == favorite and feedback.viewed_at is not None

        # 1,000 synthetic members, 2,000 titles and 40,000 interaction pairs.
        now = now_ph()
        with engine.begin() as conn:
            conn.execute(User.__table__.insert(), [dict(id=uid, name=f"Synthetic reader {uid}", role="member", password_hash="unused")
                                                  for uid in range(100, 1100)])
            conn.execute(Book.__table__.insert(), [dict(id=bid, title=f"Synthetic book {bid}", author=f"Author {bid % 50}",
                                                        category=f"Category {bid % 20}", copies_total=1, copies_available=1)
                                                  for bid in range(100, 2100)])
            conn.execute(BookInteraction.__table__.insert(), [
                dict(user_id=uid, book_id=100 + ((uid * 17 + slot) % 2000), is_favorite=slot % 3 == 0, viewed_at=now)
                for uid in range(100, 1100) for slot in range(40)
            ])
            conn.execute(text("ANALYZE"))
        timings = []
        with Session(engine) as db:
            for _ in range(5):
                started = perf_counter()
                rows = get_recommendations(100, db)
                timings.append(perf_counter() - started)
                assert len(rows) == 10 and len({row["id"] for row in rows}) == 10
            assert db.scalar(select(Book.title).where(Book.id == 1)) == "Existing synthetic book"
        print(f"PostgreSQL synthetic query times (40,000 pairs): {[round(t, 3) for t in timings]} seconds")
        assert max(timings) < 5, "Investigate query plan before release; local target is below 5 seconds"
    finally:
        engine.dispose()
