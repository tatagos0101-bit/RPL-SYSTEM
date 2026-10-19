"""Synthetic HTTP and transactional rollback checks for deployed API source only."""
from pathlib import Path


def verify_baseline_api():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from database import SessionLocal, get_db
    from limiter import limiter
    from models.book import Book
    from models.entry_log import EntryLog
    from models.user import User
    from routers import auth, reports, reservations, transactions
    from services.book_copy_service import ensure_book_copies
    from timezone_utils import now_ph

    app = FastAPI()
    app.state.limiter = limiter
    for router in (auth.router, reports.router, reservations.router, transactions.router):
        app.include_router(router)
    password = "Synthetic-only-rehearsal-472!"
    with SessionLocal() as db:
        users = [User(name="Synthetic HTTP reader", email=f"role-check-{i}@example.test",
                      role="librarian" if i == 0 else "member", status="active",
                      password_hash=auth._hash(password), must_change_password=False)
                 for i in range(3)]
        book = Book(title="Synthetic HTTP book", author="Test", category="Test",
                    copies_total=1, copies_available=1)
        db.add_all([*users, book])
        db.flush()
        ensure_book_copies(db, book.id, commit=False)
        db.add(EntryLog(user_id=users[1].id, granted=True))
        db.commit()
        ids = [user.id for user in users]
        book_id, copy_id = book.id, book.copies[0].id
    clients = [TestClient(app) for _ in range(3)]
    anonymous = TestClient(app)
    owner_engine = create_engine("postgresql+psycopg://postgres@postgres/rpl_security_test")
    try:
        for index, client in enumerate(clients):
            response = client.post("/api/auth/login", json={
                "email": f"role-check-{index}@example.test", "password": password})
            assert response.status_code == 200, "Baseline login"
            assert "httponly" in response.headers["set-cookie"].lower()
        staff, member, other = clients
        assert anonymous.get("/api/user/loans").status_code == 401
        assert member.get("/api/transactions").status_code == 403
        assert member.get("/api/reports/monthly?month=10&year=2026").status_code == 403
        assert anonymous.get("/api/reports/transcript").status_code == 401
        body = {"user_id": ids[1], "book_id": book_id, "copy_id": copy_id}
        assert member.post("/api/transactions/borrow", json=body).status_code == 403
        borrowed = staff.post("/api/transactions/borrow", json=body)
        assert borrowed.status_code == 201, "Borrow under restricted login"
        original = borrowed.json()
        assert any(loan["transaction_id"] == original["id"] for loan in member.get("/api/user/loans").json())
        assert other.get("/api/user/loans").json() == []
        queued = other.post("/api/reservations", json={"book_id": book_id})
        assert queued.status_code == 201 and queued.json()["status"] == "pending"
        reservation_id = queued.json()["id"]
        assert member.delete(f"/api/reservations/{reservation_id}").status_code == 404
        returned = staff.post("/api/transactions/return", json=body)
        assert returned.status_code == 200
        assert returned.json()["id"] == original["id"]
        assert returned.json()["borrow_date"] == original["borrow_date"]
        assert returned.json()["copy_id"] == copy_id
        ready = other.get("/api/reservations").json()
        assert any(row["id"] == reservation_id and row["status"] == "ready" for row in ready)
        assert other.delete(f"/api/reservations/{reservation_id}").status_code == 204
        current = now_ph()
        for client, path in ((member, "/api/reports/transcript"),
                             (staff, f"/api/reports/monthly?month={current.month}&year={current.year}")):
            response = client.get(path)
            assert response.status_code == 200 and response.content.startswith(b"%PDF")
        # Rehearse reverting the connection dependency to the unchanged owner,
        # then switching back. This is not a Vercel alias/environment rollback.
        def owner_db():
            with Session(owner_engine) as db:
                yield db
        before = staff.get("/api/transactions").json()
        app.dependency_overrides[get_db] = owner_db
        assert staff.get("/api/transactions").json() == before
        app.dependency_overrides.clear()
        assert staff.get("/api/transactions").json() == before
        with SessionLocal() as db:
            user = db.get(User, ids[1])
            user.status = "suspended"
            db.commit()
        assert member.get("/api/user/loans").status_code == 401
        assert anonymous.post("/api/auth/login", json={
            "email": "role-check-1@example.test", "password": password}).status_code == 403
        assert anonymous.post("/api/auth/login", json={
            "email": "role-check-0@example.test", "password": "Synthetic-wrong-472!"}).status_code == 401
        assert staff.post("/api/auth/logout").status_code == 204
        assert staff.get("/api/transactions").status_code == 401
        print("PASS: baseline password login/cookies, authorization, circulation, queue promotion/cancel, PDF reports, attendance write, logout and connection recovery")
    finally:
        app.dependency_overrides.clear()
        owner_engine.dispose()
        anonymous.close()
        for client in clients:
            client.close()


def verify_preparation_rollback(admin, runtime):
    import psycopg
    root = Path(__file__).resolve().parents[2]
    preparation = (root / "supabase/operations/prepare_runtime_role_baseline14.sql").read_text()

    def rejected(statement):
        try:
            admin.execute(statement)
        except psycopg.errors.RaiseException:
            admin.execute("ROLLBACK")
        else:
            raise AssertionError("Incompatible schema/policy must fail closed")

    admin.execute("REVOKE SELECT ON public.users FROM rpl_app_runtime")
    admin.execute("ALTER TABLE public.library_settings RENAME TO synthetic_hidden_library_settings")
    try:
        rejected(preparation)
        # The earlier GRANT in the failed preparation must not leak through.
        assert not runtime.execute("SELECT has_table_privilege(current_user,'public.users','SELECT')").fetchone()[0]
    finally:
        admin.execute("ALTER TABLE public.synthetic_hidden_library_settings RENAME TO library_settings")
        admin.execute("GRANT SELECT ON public.users TO rpl_app_runtime")
    admin.execute("ALTER POLICY rpl_backend_access ON public.library_settings USING (false)")
    try:
        rejected(preparation)
        assert admin.execute("SELECT pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='public.library_settings'::regclass AND polname='rpl_backend_access'").fetchone()[0] == "false"
    finally:
        admin.execute("ALTER POLICY rpl_backend_access ON public.library_settings USING (true)")
    # Fixture-only sentinel: not a substitute for either pending repair table.
    admin.execute("CREATE TABLE public.inventory_writes (synthetic_only integer)")
    try:
        rejected(preparation)
    finally:
        admin.execute("DROP TABLE public.inventory_writes")
    # The standard repair preparation must also refuse a 14-table target.
    rejected((root / "supabase/operations/prepare_runtime_role.sql").read_text())
    admin.execute(preparation)
    assert admin.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0] == 14
    cursor = runtime.execute((root / "supabase/operations/check_runtime_access_baseline14.sql").read_text())
    checked = 0
    while True:
        if cursor.description:
            for row in cursor.fetchall():
                assert all(value is True for value in (row[1:] if isinstance(row[0], str) else row))
                checked += 1
        if not cursor.nextset():
            break
    assert checked == 15
    print("PASS: missing-table/policy-conflict preparations roll back; baseline/repair schema mismatches are rejected")
