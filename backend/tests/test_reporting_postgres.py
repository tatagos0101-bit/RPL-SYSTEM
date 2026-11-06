"""Opt-in checks against an empty, disposable localhost PostgreSQL database."""
import os
from datetime import datetime, timedelta
from pathlib import Path
from time import perf_counter

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database import Base
from models.user import User
from models.book import Book
from models.book_copy import BookCopy
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.copy_acquisition import CopyAcquisition
from schemas.reporting import ReportFilters, ReportRequest, ReportExport, AcquisitionInput
from services.reporting_migration import upgrade_reporting_schema
from services import reporting
from routers.reporting import save_rows, snapshot
from timezone_utils import PH_TZ


def test_reporting_postgres_snapshot_permissions_migration_and_plans(monkeypatch):
    address = os.environ.get('REPORTING_TEST_DATABASE_URL')
    if not address:
        pytest.skip('Requires empty disposable localhost rpl_reporting_test PostgreSQL')
    url = make_url(address)
    assert url.host in ('localhost', '127.0.0.1') and url.database == 'rpl_reporting_test'
    engine = create_engine(url)
    now = datetime(2026, 11, 4, 12, tzinfo=PH_TZ)
    monkeypatch.setattr(reporting, 'now_ph', lambda: now)
    with engine.begin() as conn:
        assert not inspect(conn).get_table_names(), 'Refusing a nonempty database'
        for role in ('anon', 'authenticated'):
            if not conn.execute(text('SELECT 1 FROM pg_roles WHERE rolname=:r'), {'r': role}).scalar():
                conn.execute(text(f'CREATE ROLE {role} NOLOGIN'))
        Base.metadata.create_all(conn, tables=[t for t in Base.metadata.sorted_tables if t.name != 'copy_acquisitions'])
        conn.execute(User.__table__.insert(), [dict(id=i, name=f'Synthetic {i}', member_id=f'SYN-{i}', password_hash='unused', role='librarian' if i == 1 else 'member', created_at=now-timedelta(days=365)) for i in range(1, 1001)])
        conn.execute(Book.__table__.insert(), [dict(id=i, title=f'Synthetic title {i}', author='Synthetic author', category='History', copies_total=3, copies_available=3, created_at=now-timedelta(days=365)) for i in range(1, 1001)])
        conn.execute(BookCopy.__table__.insert(), [dict(id=i, book_id=(i-1)//3+1, copy_number=(i-1)%3+1, qr_code=f'SYN-COPY-{i}', status='available') for i in range(1, 3001)])
        conn.execute(EntryLog.__table__.insert(), [dict(user_id=i%999+2, granted=i%11!=0, accessed_at=now-timedelta(hours=i), entry_type='manual') for i in range(40000)])
        conn.execute(Transaction.__table__.insert(), [dict(user_id=i%999+2, book_id=i%1000+1, type='return', status='returned', borrow_date=now-timedelta(hours=i*2), return_date=now-timedelta(hours=i*2-1), due_date=now+timedelta(days=14)) for i in range(20000)])
        upgrade_reporting_schema(conn)
    runtime = (Path(__file__).resolve().parents[2] / 'supabase/operations/prepare_runtime_role.sql').read_text()
    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        with conn.connection.driver_connection.cursor() as cursor:
            cursor.execute(runtime)
    with engine.begin() as conn:
        upgrade_reporting_schema(conn); upgrade_reporting_schema(conn)
        assert conn.execute(text('SELECT count(*) FROM book_copies')).scalar() == 3000
        assert conn.execute(text('SELECT count(*) FROM copy_acquisitions')).scalar() == 0
        copy_fk = next(fk for fk in inspect(conn).get_foreign_keys('copy_acquisitions') if fk['referred_table'] == 'book_copies')
        assert copy_fk['options']['ondelete'] == 'CASCADE'
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='copy_acquisitions'::regclass")).scalar()
        for role in ('anon', 'authenticated'):
            for permission in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'):
                assert not conn.execute(text("SELECT has_table_privilege(:r, 'copy_acquisitions', :p)"), {'r': role, 'p': permission}).scalar()
        conn.execute(text('SET LOCAL ROLE rpl_app_runtime'))
        assert conn.execute(text('SELECT count(*) FROM copy_acquisitions')).scalar() == 0
        assert not conn.execute(text("SELECT has_table_privilege(current_user,'copy_acquisitions','TRUNCATE')")).scalar()
        conn.execute(text("INSERT INTO copy_acquisitions(copy_id,source,acquired_on,recorded_by,updated_by,created_at,updated_at) VALUES(1,'donated','2026-11-01',1,1,now(),now())"))
    with Session(engine) as db:
        f = ReportFilters(category='visits', start='2026-11-01', end='2026-11-30', period='month', group='day')
        with snapshot(db) as reader:
            assert reader.execute(text('SHOW transaction_read_only')).scalar() == 'on'
            assert reader.execute(text('SHOW transaction_isolation')).scalar() == 'repeatable read'
            response = reporting.report(reader, ReportRequest(filters=f), 1)
            first = response['total']
            with engine.begin() as writer:
                writer.execute(EntryLog.__table__.insert().values(user_id=2, granted=True, accessed_at=now-timedelta(minutes=1)))
            assert reporting.report(reader, ReportRequest(filters=f), 1)['total'] == first
        with snapshot(db) as reader:
            with pytest.raises(HTTPException) as error:
                reporting.report(reader, ReportExport(filters=f, context=response['context'], format='csv'), 1, export=True)
            assert error.value.status_code == 409
        # Every reporting projection executes on PostgreSQL, including date-only acquisitions.
        for category in reporting.CATEGORIES:
            local = f.model_copy(update={'category': category})
            with snapshot(db) as reader:
                result = reporting.report(reader, ReportRequest(filters=local), 1)
                assert result['total'] >= 0
        with snapshot(db) as reader:
            started = perf_counter(); result = reporting.dashboard(reader, f)
            print(f'POSTGRES dashboard 40k visits / 20k loans / 3k copies: {perf_counter()-started:.3f}s')
            assert result['metrics']['acquired_copies'] == 1
    # Test the actual correlated history/period predicates with EXPLAIN ANALYZE.
    candidates = [
        ('ix_reporting_visits_date', 'entry_logs (accessed_at) WHERE granted IS TRUE', "SELECT count(*) FROM entry_logs WHERE granted IS TRUE AND accessed_at >= '2026-11-01+08'::timestamptz"),
        ('ix_reporting_visits_user_date', 'entry_logs (user_id, accessed_at) WHERE granted IS TRUE', "SELECT 1 FROM entry_logs WHERE granted IS TRUE AND user_id=123456 AND accessed_at < '2026-11-01+08'::timestamptz LIMIT 1"),
        ('ix_reporting_borrow_date', 'transactions (borrow_date)', "SELECT count(*) FROM transactions WHERE borrow_date >= '2026-11-01+08'::timestamptz"),
        ('ix_reporting_return_date', 'transactions (return_date) WHERE return_date IS NOT NULL', "SELECT count(*) FROM transactions WHERE return_date >= '2026-11-01+08'::timestamptz"),
        ('ix_reporting_book_borrow_date', 'transactions (book_id, borrow_date)', "SELECT count(*) FROM transactions WHERE book_id=300 AND borrow_date >= '2026-11-01+08'::timestamptz"),
    ]
    with engine.begin() as conn:
        conn.execute(text('ANALYZE'))
        for name, definition, sql in candidates:
            conn.execute(text(f'DROP INDEX IF EXISTS {name}'))
            before = conn.execute(text('EXPLAIN (ANALYZE, FORMAT JSON) '+sql)).scalar()[0]
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS {name} ON {definition}'))
            conn.execute(text('ANALYZE'))
            after = conn.execute(text('EXPLAIN (ANALYZE, FORMAT JSON) '+sql)).scalar()[0]
            print(f'PLAN {name}: {before["Execution Time"]}ms -> {after["Execution Time"]}ms; {after["Plan"]}')
            if name == 'ix_reporting_book_borrow_date': conn.execute(text(f'DROP INDEX {name}'))
    with engine.begin() as conn:
        conn.execute(text('SET LOCAL ROLE rpl_app_runtime'))
        with Session(bind=conn) as reader:
            result = reporting.report(reader, ReportRequest(filters=f.model_copy(update={'category':'acquisitions'})), 1)
            assert result['total'] == 1
    # Concurrent import/edit detects a version race rather than overwriting metadata.
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    barrier = Barrier(2)
    def competing_write(source):
        with Session(engine) as db:
            actor = db.get(User, 1); barrier.wait(timeout=10)
            try:
                save_rows(db, [AcquisitionInput(copy_id=2, source=source)], actor)
                return 'saved'
            except HTTPException as exc:
                db.rollback(); return exc.status_code
    with ThreadPoolExecutor(2) as pool:
        futures = [pool.submit(competing_write, source) for source in ('purchased', 'donated')]
        assert sorted([str(f.result(timeout=15)) for f in futures]) == ['409', 'saved']
    engine.dispose()
