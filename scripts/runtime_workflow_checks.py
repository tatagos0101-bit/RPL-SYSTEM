"""Rollback-only synthetic checks shared by temporary acceptance probes."""
import logging
import os
from pathlib import Path
import secrets
import sys


def check(condition):
    if not condition:
        raise RuntimeError("Workflow acceptance failed")


def run_workflows(test_app=None, client_headers=None, acceptance_hook=None):
    # No production signing key, Storage credentials, dotenv or app startup.
    if test_app is None:
        uri = os.environ["RPL_RUNTIME_CANDIDATE_URI"]
        for key in tuple(os.environ):
            if key.startswith(("PG", "POSTGRES_", "SUPABASE_", "RATE_LIMIT", "RPL_REDIS")):
                os.environ.pop(key, None)
        os.environ.update(DATABASE_URL=uri, JWT_SECRET_KEY=secrets.token_hex(48),
                          LIBRARIAN_AUTH_CODE="", ENTRY_STATION_PIN="", ENVIRONMENT="production",
                          AUTO_MIGRATE="false", PYTHON_DOTENV_DISABLED="1", LOG_TO_FILES="false",
                          STORAGE_BACKEND="local", RATE_LIMIT_STORAGE_URI="", RATE_LIMIT_REQUIRE_SHARED="false")
    logging.disable(logging.CRITICAL)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app_source"))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import select, text
    from sqlalchemy.orm import Session
    import database
    from models import (user, auth_session, face_embedding, book, book_copy,
                        book_interaction, transaction, reservation, inventory_write,
                        entry_log, reading_goal, library_settings, notification,
                        password_reset, security_alert)  # register relationships
    from models.user import User
    from models.book import Book
    from models.entry_log import EntryLog
    from models.inventory_write import InventoryWrite
    from models.reservation import ReservationConfirmation
    from routers import auth, transactions, reservations, reports
    from limiter import limiter
    from services.book_copy_service import ensure_book_copies
    from services.inventory_writes import remember_write, find_write

    if test_app is None:
        test_app = FastAPI()
        test_app.state.limiter = limiter
        for router in (auth.router, transactions.router, reservations.router, reports.router):
            test_app.include_router(router)
    tag = secrets.token_hex(12)
    password = secrets.token_urlsafe(32) + "1!"
    clients = []
    inserted_ids = []
    connection = database.engine.connect()
    outer = connection.begin()
    try:
        connection.execute(text("SET LOCAL statement_timeout='8s'"))
        connection.execute(text("SET LOCAL lock_timeout='2s'"))
        connection.execute(text("SET LOCAL idle_in_transaction_session_timeout='120s'" if acceptance_hook else
                                "SET LOCAL idle_in_transaction_session_timeout='30s'"))
        with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
            users = [User(name="Synthetic runtime acceptance", email=f"runtime-{tag}-{i}@example.test",
                          role="librarian" if i == 0 else "member", status="active",
                          password_hash=auth._hash(password), must_change_password=False)
                     for i in range(3)]
            book = Book(title="Synthetic runtime acceptance", author="Test", category="Test",
                        copies_total=1, copies_available=1)
            db.add_all([*users, book])
            db.flush()
            ensure_book_copies(db, book.id, commit=False)
            db.add(EntryLog(user_id=users[1].id, granted=True))
            db.commit()
            inserted_ids = [user.id for user in users]
            book_id, copy_id = book.id, book.copies[0].id

        def isolated_db():
            check(outer.is_active)
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                yield db
            check(outer.is_active)

        test_app.dependency_overrides[database.get_db] = isolated_db
        # Match Vercel's HTTPS proxy header; HTTPS_ONLY otherwise redirects even
        # an in-process test URL because no reverse proxy populated this header.
        request_headers = {"X-Forwarded-Proto": "https", **(client_headers or {})}
        clients = [TestClient(test_app, base_url="https://testserver", headers=request_headers) for _ in range(4)]
        staff, member, other, anonymous = clients
        for index, client in enumerate(clients[:3]):
            response = client.post("/api/auth/login", json={"email": f"runtime-{tag}-{index}@example.test", "password": password})
            check(response.status_code == 200)
            check("httponly" in response.headers["set-cookie"].lower())
            check("secure" in response.headers["set-cookie"].lower())
        check(anonymous.get("/api/user/loans").status_code == 401)
        check(member.get("/api/transactions").status_code == 403)
        body = {"user_id": inserted_ids[1], "book_id": book_id, "copy_id": copy_id}
        check(member.post("/api/transactions/borrow", json=body).status_code == 403)
        borrowed = staff.post("/api/transactions/borrow", json=body)
        check(borrowed.status_code == 201)
        original = borrowed.json()
        check(other.get("/api/user/loans").json() == [])
        check(any(row["transaction_id"] == original["id"] for row in member.get("/api/user/loans").json()))
        queued = other.post("/api/reservations", json={"book_id": book_id, "accept_queue": True})
        check(queued.status_code == 201)
        reservation_id = queued.json()["id"]
        check(member.delete(f"/api/reservations/{reservation_id}").status_code == 404)
        returned = staff.post("/api/transactions/return", json=body)
        check(returned.status_code == 200)
        check(all(returned.json()[key] == original[key] for key in ("id", "borrow_date", "copy_id")))
        check(any(row["id"] == reservation_id and row["status"] == "ready" for row in other.get("/api/reservations").json()))
        check(other.delete(f"/api/reservations/{reservation_id}").status_code == 204)
        transcript = member.get("/api/reports/transcript")
        check(transcript.status_code == 200 and transcript.content.startswith(b"%PDF"))
        if acceptance_hook is not None:
            acceptance_hook(clients, inserted_ids)
        with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
            check(db.query(ReservationConfirmation).filter_by(user_id=inserted_ids[2]).count() == 1)
            remember_write(db, inserted_ids[0], tag, "test", "0" * 64, {"synthetic": True})
            db.commit()
            check(find_write(db, inserted_ids[0], tag).result == {"synthetic": True})
            db.get(User, inserted_ids[1]).status = "suspended"
            db.commit()
        check(member.get("/api/user/loans").status_code == 401)
        check(staff.post("/api/auth/logout").status_code == 204)
        check(staff.get("/api/transactions").status_code == 401)
        check(outer.is_active)
    finally:
        try:
            outer.rollback()
        finally:
            connection.close()
            database.engine.dispose()
            for client in clients:
                client.close()
            test_app.dependency_overrides.clear()
    # Check only the generated synthetic keys, never enumerate patron rows.
    with database.engine.connect() as verify_connection:
        check(not verify_connection.execute(select(User.id).where(User.id.in_(inserted_ids))).first())
        check(not verify_connection.execute(select(Book.id).where(Book.id == book_id)).first())
    database.engine.dispose()
    return {"workflow_checks_passed": True, "synthetic_rows_rolled_back": True,
            "schema": "repair16", "production_alias_changed": False}
