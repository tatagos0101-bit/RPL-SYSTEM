import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateColumn, CreateIndex

import database
from models.entry_log import EntryLog


INDEX_NAME = "uq_entry_logs_manual_request_id"


def test_manual_visitor_upgrade_preserves_existing_rows_and_enforces_unique_requests(monkeypatch):
    engine = create_engine("sqlite+pysqlite://")
    monkeypatch.setattr(database, "engine", engine)
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE entry_logs (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER REFERENCES users (id),
                    entry_type VARCHAR(9) NOT NULL,
                    granted BOOLEAN NOT NULL,
                    note VARCHAR(255),
                    accessed_at DATETIME,
                    time_out DATETIME
                )
            """))
            conn.execute(text("""
                INSERT INTO entry_logs (id, entry_type, granted, note, accessed_at, time_out)
                VALUES (1, 'face_scan', 0, 'Unknown visitor', '2026-11-20 09:00:00', NULL),
                       (2, 'manual', 1, 'Legacy visit', '2026-11-20 10:00:00', '2026-11-20 11:00:00')
            """))

        database.init_db()
        with engine.begin() as conn:
            conn.execute(EntryLog.__table__.insert().values(
                id=3, entry_type="manual", granted=True, visitor_name="Synthetic Visitor",
                visitor_location="Synthetic Location", manual_request_id="6e76f354-12ad-4fdb-92e6-7b6886624dea",
            ))

        database.init_db()
        with engine.begin() as conn:
            rows = conn.execute(text("""
                SELECT id, entry_type, granted, note, time_out, visitor_name, visitor_location, manual_request_id
                FROM entry_logs ORDER BY id
            """)).all()
            assert rows == [
                (1, "face_scan", 0, "Unknown visitor", None, None, None, None),
                (2, "manual", 1, "Legacy visit", "2026-11-20 11:00:00", None, None, None),
                (3, "manual", 1, None, None, "Synthetic Visitor", "Synthetic Location", "6e76f354-12ad-4fdb-92e6-7b6886624dea"),
            ]
            index = next(index for index in inspect(conn).get_indexes("entry_logs") if index["name"] == INDEX_NAME)
            assert index["unique"]
            assert index["column_names"] == ["manual_request_id"]
            with pytest.raises(IntegrityError, match="entry_logs.manual_request_id"):
                conn.execute(EntryLog.__table__.insert().values(
                    id=4, entry_type="manual", granted=True, manual_request_id=rows[-1].manual_request_id,
                ))
    finally:
        engine.dispose()


def test_manual_visitor_postgres_ddl_has_nullable_columns_and_partial_unique_index():
    dialect = postgresql.dialect()
    table = EntryLog.__table__
    for name, length in (("visitor_name", 150), ("visitor_location", 200), ("manual_request_id", 36)):
        column = table.c[name]
        assert column.nullable
        assert str(CreateColumn(column).compile(dialect=dialect)) == f"{name} VARCHAR({length})"
    index = next(index for index in table.indexes if index.name == INDEX_NAME)
    assert str(CreateIndex(index).compile(dialect=dialect)) == (
        f"CREATE UNIQUE INDEX {INDEX_NAME} ON entry_logs (manual_request_id) "
        "WHERE manual_request_id IS NOT NULL"
    )
