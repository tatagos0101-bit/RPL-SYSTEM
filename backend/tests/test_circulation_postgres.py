"""Opt-in, destructive only inside a disposable localhost rpl_qr_test database."""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from database import Base
from models.book import Book
from models.book_copy import BookCopy
from models.inventory_write import InventoryWrite
from models.transaction import Transaction
from models.user import User
from routers.transactions import borrow_book, return_book
from schemas.transaction import BorrowRequest, ReturnRequest
from services.book_copy_service import ensure_book_copies


def test_postgres_circulation_receipts_and_competing_loans():
    address = os.environ.get('CIRCULATION_TEST_DATABASE_URL')
    if not address:
        pytest.skip('Requires disposable localhost rpl_qr_test PostgreSQL')
    url = make_url(address)
    assert url.host in ('127.0.0.1', 'localhost') and url.database == 'rpl_qr_test'
    engine = create_engine(url, connect_args={'connect_timeout': 5})
    with engine.connect() as connection:
        assert not inspect(connection).get_table_names(), 'Use an empty disposable database'
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            db.add_all([User(id=i, name='Synthetic', role='librarian' if i < 3 else 'member',
                             status='active', password_hash='unused') for i in range(1, 5)])
            db.add(Book(id=1, title='Synthetic QR', author='Synthetic', category='General',
                        copies_total=1, copies_available=1))
            db.commit(); ensure_book_copies(db, 1)
            copy_id = db.query(BookCopy.id).scalar()

        def race(calls):
            barrier = Barrier(len(calls))
            def invoke(call):
                function, body, actor_id, request_id = call
                with Session(engine, autoflush=False) as db:
                    db.execute(text("SET LOCAL lock_timeout = '5s'"))
                    actor = db.get(User, actor_id)
                    barrier.wait(timeout=10)
                    try:
                        return function(body, db=db, _=actor, request_id=request_id)
                    except HTTPException as error:
                        db.rollback()
                        return error.status_code
            with ThreadPoolExecutor(max_workers=len(calls)) as pool:
                return list(pool.map(invoke, calls))

        payload = BorrowRequest(user_id=3, book_id=1, copy_id=copy_id)
        key = uuid4()
        # The same librarian's simultaneous retries commit exactly one receipt/loan.
        outcomes = race([(borrow_book, payload, 1, key)] * 2)
        assert outcomes[0] == outcomes[1] and isinstance(outcomes[0], dict)
        loan = outcomes[0]
        with Session(engine) as db:
            assert db.query(Transaction).count() == db.query(InventoryWrite).count() == 1
            assert db.get(Book, 1).copies_available == 0
        returning = ReturnRequest(user_id=3, book_id=1, copy_id=copy_id, transaction_id=loan['id'])
        return_key = uuid4()
        outcomes = race([(return_book, returning, 1, return_key)] * 2)
        assert outcomes[0] == outcomes[1] and outcomes[0]['status'] == 'returned'

        # Different staff and members contend for one available physical copy.
        outcomes = race([(borrow_book, payload, 1, uuid4()),
                         (borrow_book, BorrowRequest(user_id=4, book_id=1, copy_id=copy_id), 2, uuid4())])
        assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1
        assert 409 in outcomes
        winner = next(outcome for outcome in outcomes if isinstance(outcome, dict))
        # A delayed request for the original loan cannot close this newer loan.
        assert race([(return_book, returning, 1, uuid4())]) == [404]
        assert race([(return_book, returning, 1, return_key)])[0]['id'] == loan['id']
        exact = ReturnRequest(user_id=winner['user_id'], book_id=1, copy_id=copy_id, transaction_id=winner['id'])
        outcomes = race([(return_book, exact, 1, uuid4()), (return_book, exact, 2, uuid4())])
        assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1 and 404 in outcomes
        with Session(engine) as db:
            assert db.get(Book, 1).copies_available == 1
            assert db.get(BookCopy, copy_id).status == 'available'
            assert db.query(Transaction).filter(Transaction.status.in_(['active', 'overdue'])).count() == 0
            assert db.query(Transaction).count() == 2
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
