"""Exercise actual circulation handlers on disposable PostgreSQL, with overlapping requests."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import monotonic, sleep

from fastapi import HTTPException
from sqlalchemy import text

from database import SessionLocal
from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction
from models.user import User
from routers.transactions import borrow_book, return_book
from schemas.transaction import BorrowRequest, ReturnRequest
from services.book_copy_service import ensure_book_copies


def fixture(copies=2):
    with SessionLocal() as db:
        users = [User(name="Synthetic concurrent reader", role="member", password_hash="unused") for _ in range(2)]
        book = Book(title="Synthetic concurrency book", author="Test", category="Test",
                    copies_total=copies, copies_available=copies)
        db.add_all([book, *users])
        db.flush()
        ensure_book_copies(db, book.id, commit=False)
        db.commit()
        return book.id, [u.id for u in users], [c.id for c in book.copies]


def call(handler, body):
    with SessionLocal() as db:
        db.execute(text("SET statement_timeout = '8s'"))
        try:
            result = handler(body=body, db=db, _=None)
            return 200, result.id
        except HTTPException as error:
            db.rollback()
            return error.status_code, None


def overlap(admin, book_id, operations):
    # Keep the book locked until both requests are waiting in PostgreSQL. This
    # forces overlap instead of relying on scheduler timing or repeated retries.
    import psycopg
    barrier = Barrier(2)
    def run(operation):
        barrier.wait(timeout=5)
        return call(*operation)
    with psycopg.connect(host="postgres", dbname="rpl_security_test", user="rpl_security_login") as held:
        held.execute("SELECT id FROM books WHERE id=%s FOR UPDATE", (book_id,))
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(run, operation) for operation in operations]
            try:
                deadline = monotonic() + 5
                while monotonic() < deadline:
                    waiting = admin.execute("""SELECT count(*) FROM pg_stat_activity
                        WHERE usename='rpl_security_login' AND wait_event_type='Lock'""").fetchone()[0]
                    if waiting >= 2:
                        break
                    assert not any(f.done() for f in futures), "Request completed before serialization point"
                    sleep(0.025)
                else:
                    raise AssertionError("Both requests must overlap at a database lock")
            finally:
                held.rollback()
            return [future.result(timeout=10) for future in futures]


def assert_inventory(book_id, expected_active):
    with SessionLocal() as db:
        book = db.get(Book, book_id)
        active = db.query(Transaction).filter(Transaction.book_id == book_id,
                                               Transaction.status.in_(["active", "overdue"])).all()
        assert len(active) == expected_active
        assert len({row.copy_id for row in active}) == len(active)
        assert book.copies_available == book.copies_total - len(active)
        assert sum(copy.status == "available" for copy in book.copies) == book.copies_available


def verify_circulation(admin):
    book, users, copies = fixture()
    operations = [(borrow_book, BorrowRequest(user_id=user, book_id=book, copy_id=copies[0])) for user in users]
    assert sorted(code for code, _ in overlap(admin, book, operations)) == [200, 409]
    assert_inventory(book, 1)
    print("PASS: concurrent borrowers cannot check out the same physical copy")

    book, users, copies = fixture()
    operations = [(borrow_book, BorrowRequest(user_id=users[0], book_id=book, copy_id=copy)) for copy in copies]
    assert sorted(code for code, _ in overlap(admin, book, operations)) == [200, 409]
    assert_inventory(book, 1)
    print("PASS: one member cannot acquire duplicate active loans through concurrent scans")

    book, users, copies = fixture()
    operations = [(borrow_book, BorrowRequest(user_id=user, book_id=book, copy_id=copy))
                  for user, copy in zip(users, copies)]
    assert [code for code, _ in overlap(admin, book, operations)] == [200, 200]
    assert_inventory(book, 2)
    print("PASS: simultaneous valid borrows retain both loans and the correct inventory count")

    body = ReturnRequest(user_id=users[0], book_id=book, copy_id=copies[0])
    with SessionLocal() as db:
        original = db.query(Transaction).filter_by(book_id=book, user_id=users[0]).one()
        loan_id, borrow_date = original.id, original.borrow_date
    assert sorted(code for code, _ in overlap(admin, book, [(return_book, body)] * 2)) == [200, 404]
    assert_inventory(book, 1)
    with SessionLocal() as db:
        original = db.get(Transaction, loan_id)
        assert original.status == "returned" and original.borrow_date == borrow_date
        assert original.copy_id == copies[0]
    print("PASS: duplicate concurrent returns restore stock once and preserve the original loan history")
