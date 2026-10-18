"""Explicitly isolated PostgreSQL acceptance; never points at a cloud database."""
import os
import asyncio
from io import BytesIO
from pathlib import Path
from openpyxl import Workbook
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
import database
from database import Base
from models.user import User
from models.book import Book
from models.reservation import Reservation
from schemas.reservation import ReservationRequest
from services.reservation_confirmation import confirm_reservations
from services.borrowing_capacity import borrowing_capacity, lock_member
from services.entry_session_policy import record_entry_scan
from models.entry_log import EntryLog
from routers.transactions import borrow_book
from schemas.transaction import BorrowRequest
from timezone_utils import now_ph


def test_postgres_migration_and_competing_confirmations(monkeypatch):
    address = os.environ.get('REPAIR_TEST_DATABASE_URL')
    if not address:
        pytest.skip('Requires disposable localhost rpl_repair_test PostgreSQL')
    url = make_url(address)
    assert url.host in ('127.0.0.1', 'localhost') and url.database == 'rpl_repair_test'
    engine = create_engine(url, connect_args={'connect_timeout': 5})
    monkeypatch.setattr(database, 'engine', engine)
    with engine.connect() as conn:
        assert not inspect(conn).get_table_names(), 'Use an empty disposable database'
    try:
        with engine.begin() as conn:
            for role in ('anon', 'authenticated'):
                if not conn.execute(text('SELECT 1 FROM pg_roles WHERE rolname=:role'), {'role': role}).scalar():
                    conn.execute(text(f'CREATE ROLE {role} NOLOGIN'))
        database.init_db()
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE notifications ALTER COLUMN message TYPE VARCHAR(255)"))
            conn.execute(text("INSERT INTO notifications(message, type, is_read) VALUES ('Synthetic existing notice', 'test', false)"))
        database.init_db(); database.init_db()
        # Execute the exact additive runtime grant script twice, only on this
        # disposable target. Browser roles must remain denied afterward.
        script = (Path(__file__).resolve().parents[2] / 'supabase/operations/prepare_runtime_role.sql').read_text()
        with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
            with conn.connection.driver_connection.cursor() as cursor:
                cursor.execute(script)
                cursor.execute(script)
        with engine.connect() as conn:
            assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='reservation_confirmations'::regclass")).scalar()
            for role in ('anon', 'authenticated'):
                assert not conn.execute(text("SELECT has_table_privilege(:role, 'reservation_confirmations', 'SELECT')"), {'role': role}).scalar()
            assert 'uq_reservations_active_member_book' in {i['name'] for i in inspect(conn).get_indexes('reservations')}
            assert all(str(c['type']) == 'TEXT' for c in inspect(conn).get_columns('notifications') if c['name'] in ('message','member_name','book_title'))
            assert conn.execute(text("SELECT message FROM notifications WHERE type='test'")).scalar() == 'Synthetic existing notice'
            conn.execute(text('SET LOCAL ROLE rpl_app_runtime'))
            assert conn.execute(text('SELECT count(*) FROM reservation_confirmations')).scalar() == 0
            assert not conn.execute(text("SELECT has_table_privilege(current_user, 'reservation_confirmations', 'TRUNCATE')")).scalar()
        with Session(engine) as db:
            db.add_all([User(id=i, name='Synthetic', role='member', password_hash='unused') for i in (1,2,3,4,5,6)])
            db.add_all([Book(id=i, title=f'Synthetic {i}', author='Author', category='General', copies_total=1, copies_available=1) for i in range(1,16)])
            db.commit()
        def race(calls):
            barrier = Barrier(len(calls))
            def invoke(args):
                with Session(engine, autoflush=False) as db:
                    barrier.wait(timeout=10)
                    try:
                        rows = confirm_reservations(db, args[0], [ReservationRequest(book_id=i) for i in args[1]], args[2])
                        db.commit()
                        return [r.status for r in rows]
                    except HTTPException as error:
                        db.rollback()
                        return error.detail['code']
            with ThreadPoolExecutor(max_workers=len(calls)) as pool:
                return list(pool.map(invoke, calls))
        outcomes = race([(1, [1], uuid4()), (2, [1], uuid4())])
        assert outcomes.count(['ready']) == 1 and outcomes.count('availability_changed') == 1
        outcomes = race([(3, [2,3,4], uuid4()), (3, [5,6,7], uuid4())])
        assert outcomes.count('quota_exceeded') == 1
        key = uuid4()
        results = race([(3, [8], key), (3, [8], key)])
        assert results == [['ready'], ['ready']]
        with Session(engine) as db:
            assert db.query(Reservation).filter_by(user_id=3).count() == 4
            assert borrowing_capacity(db, 3)['remaining_slots'] == 1
            reservation = db.query(Reservation).first()
            assert reservation.reserved_at.tzinfo and reservation.expires_at.tzinfo
            assert abs((reservation.expires_at-reservation.reserved_at).total_seconds()-86400) < 2
        # A librarian borrow competes with confirmation for the SAME fifth slot.
        with Session(engine) as db:
            confirm_reservations(db, 4, [ReservationRequest(book_id=i) for i in (9,10,11,12)], uuid4())
            db.commit()
        slot_barrier = Barrier(2)
        def take_last_slot(kind):
            with Session(engine, autoflush=False) as db:
                slot_barrier.wait(timeout=10)
                try:
                    if kind == 'borrow':
                        borrow_book(BorrowRequest(user_id=4, book_id=13), db=db, _=None)
                    else:
                        confirm_reservations(db, 4, [ReservationRequest(book_id=14)], uuid4())
                        db.commit()
                    return 'accepted'
                except HTTPException as error:
                    db.rollback()
                    return error.detail['code']
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(take_last_slot, ('borrow', 'reserve'))) == ['accepted', 'quota_exceeded']
        with Session(engine) as db:
            assert borrowing_capacity(db, 4)['remaining_slots'] == 0
            # Real runtime-role writes verify RLS policy, not just grants.
            db.execute(text('SET LOCAL ROLE rpl_app_runtime'))
            db.execute(text("UPDATE reservation_confirmations SET fingerprint=fingerprint WHERE user_id=4"))
            db.commit()

        # Promotion notifications must not deadlock on another member's quota
        # lock (their FK takes KEY SHARE). Reproduce that exact lock overlap.
        with Session(engine) as db:
            db.add(Reservation(user_id=5, book_id=15, status='pending'))
            db.commit()
        def promote_while_member_locked():
            with Session(engine, autoflush=False) as db:
                db.execute(text("SET LOCAL lock_timeout='2s'"))
                result = confirm_reservations(db, 6, [ReservationRequest(book_id=15, accept_queue=True)], uuid4())
                db.commit()
                return result[0].status
        with Session(engine) as locked:
            lock_member(locked, 5)
            with ThreadPoolExecutor(max_workers=1) as pool:
                assert pool.submit(promote_while_member_locked).result(timeout=5) == 'pending'
            locked.rollback()

        # PostgreSQL statement errors abort a transaction unless isolated by a
        # savepoint. Exercise the actual import route with a failed middle row.
        from routers import inventory
        original = inventory.ensure_book_copies
        def fail_middle(db, book_id, **kwargs):
            if db.get(Book, book_id).title == 'Import failure':
                db.execute(text('SELECT 1 / 0'))
            return original(db, book_id, **kwargs)
        workbook = Workbook(); sheet = workbook.active
        sheet.append(['Title', 'Author', 'Copies'])
        for title in ('Import first', 'Import failure', 'Import last'):
            sheet.append([title, 'Synthetic author', 1])
        content = BytesIO(); workbook.save(content)
        async def read_synthetic(**kwargs):
            return content.getvalue(), 'synthetic.xlsx', None
        with engine.begin() as conn:
            conn.execute(text("SELECT setval(pg_get_serial_sequence('books','id'), 15)"))
        with monkeypatch.context() as patch:
            patch.setattr(inventory, 'ensure_book_copies', fail_middle)
            patch.setattr(inventory, 'read_upload', read_synthetic)
            with Session(engine, autoflush=False) as db:
                result = asyncio.run(inventory.bulk_upload(file=None, upload_ticket=None, db=db, _=db.get(User, 1)))
                assert result.added == 2 and result.errors[0].startswith('Row 3:')
                assert [b.title for b in db.query(Book).filter(Book.title.like('Import%')).order_by(Book.id)] == ['Import first', 'Import last']
        # Retry requests serialize under PostgreSQL, including non-ISBN titles.
        from schemas.book import BookCreate
        from models.inventory_write import InventoryWrite
        with Session(engine) as db:
            db.add(User(id=100, name='Synthetic inventory staff', role='librarian', password_hash='unused'))
            db.commit()
        request_id = uuid4()
        write_barrier = Barrier(2)
        def create_once(_):
            with Session(engine) as db:
                actor = db.get(User, 100)
                write_barrier.wait(timeout=10)
                result = inventory.add_book(BookCreate(title='Concurrent non-ISBN', author='Author', category='General'),
                                            db=db, _=actor, request_id=request_id)
                return result['id'] if isinstance(result, dict) else result.id
        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(create_once, range(2)))
        assert ids[0] == ids[1]
        with Session(engine) as db:
            assert db.query(Book).filter_by(title='Concurrent non-ISBN').count() == 1
            assert db.query(InventoryWrite).count() == 1
            db.execute(text('SET LOCAL ROLE rpl_app_runtime'))
            assert db.execute(text('SELECT count(*) FROM inventory_writes')).scalar() == 1
            db.execute(text('UPDATE inventory_writes SET fingerprint=fingerprint'))
            db.commit()
        with engine.connect() as conn:
            assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='inventory_writes'::regclass")).scalar()
            for role in ('anon', 'authenticated'):
                assert not conn.execute(text("SELECT has_table_privilege(:role, 'inventory_writes', 'SELECT')"), {'role': role}).scalar()
        barrier = Barrier(2)
        seen_at = now_ph()
        def scan():
            with Session(engine) as db:
                user = db.get(User, 1)
                barrier.wait(timeout=10)
                _, action = record_entry_scan(db, user, seen_at=seen_at)
                db.commit()
                return action
        with ThreadPoolExecutor(max_workers=2) as pool:
            actions = list(pool.map(lambda _: scan(), range(2)))
        assert sorted(actions) == ['still_inside', 'time_in']
        with Session(engine) as db:
            log = db.query(EntryLog).one()
            assert log.accessed_at == seen_at and log.accessed_at.tzinfo is not None
        # Existing malformed identities abort before any upgrade modifies records.
        with engine.begin() as conn:
            conn.execute(text('DROP INDEX uq_users_normalized_email'))
            conn.execute(text("UPDATE users SET email=CASE id WHEN 1 THEN 'Case@example.test' WHEN 2 THEN 'case@example.test' END WHERE id IN (1,2)"))
        with pytest.raises(RuntimeError, match='conflicting email'):
            database.init_db()
        with engine.connect() as conn:
            assert conn.execute(text('SELECT count(*) FROM reservations WHERE user_id IN (1,2,3)')).scalar() == 5
        with engine.begin() as conn:
            conn.execute(text('UPDATE users SET email=NULL'))
            conn.execute(text('DROP INDEX uq_reservations_active_member_book'))
            conn.execute(text("INSERT INTO reservations(user_id, book_id, status) VALUES (3, 8, 'pending')"))
        with pytest.raises(RuntimeError, match='duplicate active'):
            database.init_db()
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM reservations WHERE user_id=3 AND book_id=8 AND status='pending'"))
            conn.execute(text('UPDATE books SET copies_available=0 WHERE id=8'))
        with pytest.raises(RuntimeError, match='overcommitted ready holds'):
            database.init_db()
    finally:
        with engine.begin() as conn:
            Base.metadata.drop_all(conn)
        engine.dispose()
