"""Deletion/borrow serialization on disposable PostgreSQL; synthetic records only."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi import HTTPException
from sqlalchemy import text

from database import SessionLocal
from models.book import Book
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.user import User
from routers.transactions import borrow_book, return_book
from schemas.transaction import BorrowRequest, ReturnRequest
from services.book_copy_service import ensure_book_copies
from services.member_deletion import delete_account, lock_existing_member
from timezone_utils import now_ph


def verify_member_deletion(admin):
    assert admin.execute("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='deleted_at'").fetchone() == ("YES",)
    with SessionLocal() as db:
        member = User(name="Synthetic deletion reader", role="member", password_hash="unused",
                      email="deletion@example.test")
        book = Book(title="Synthetic deletion title", author="Synthetic", category="General",
                    copies_total=1, copies_available=1)
        db.add_all([member, book]); db.flush()
        ensure_book_copies(db, book.id, commit=False)
        visit = EntryLog(user_id=member.id, granted=True, entry_type="face_scan",
                         accessed_at=now_ph(), time_out=now_ph(), note=member.name)
        db.add(visit); db.commit()
        member_id, book_id, visit_id = member.id, book.id, visit.id
        copy_id = book.copies[0].id
    barrier = Barrier(2)
    def attempt(kind):
        with SessionLocal() as db:
            db.execute(text("SET statement_timeout = '8s'"))
            barrier.wait(timeout=10)
            try:
                if kind == "borrow":
                    borrow_book(BorrowRequest(user_id=member_id, book_id=book_id, copy_id=copy_id), db=db, _=None)
                    return "borrowed"
                member = lock_existing_member(db, member_id)
                delete_account(db, member)
                db.commit()
                return "deleted"
            except HTTPException as error:
                db.rollback()
                assert error.status_code in (403, 409)
                return "blocked"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["borrow", "delete"]))
    assert results.count("blocked") == 1
    with SessionLocal() as db:
        if "borrowed" in results:
            return_book(ReturnRequest(user_id=member_id, book_id=book_id, copy_id=copy_id), db=db, _=None)
            delete_account(db, lock_existing_member(db, member_id))
            db.commit()
            tx = db.query(Transaction).filter_by(user_id=member_id).one()
            assert tx.status == "returned" and tx.copy_id == copy_id and tx.borrow_date
        member = db.get(User, member_id)
        assert member.deleted_at and member.email is None and member.status == "suspended"
        assert db.get(EntryLog, visit_id).note is None
        assert db.get(Book, book_id).copies_available == 1
        delete_account(db, member); db.commit()
    print("PASS: PostgreSQL deletion column, competing borrow/deletion, retained history and idempotent retry")
