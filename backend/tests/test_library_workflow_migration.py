"""Upgrade existing rows without inventing historical inspections."""
from sqlalchemy import MetaData, Table, create_engine, inspect, text

from database import Base
from services.schema_migrations import upgrade_schema
from timezone_utils import now_ph

NEW_COLUMNS = {
    "books": {"is_borrowable", "circulation_note"},
    "book_copies": {"condition"},
    "users": {"is_blacklisted"},
    "transactions": {"late_fee", "condition_fee", "return_condition", "inspection_reason",
        "inspection_notes", "inspected_by_id", "inspected_at"},
}


def test_additive_accountability_upgrade_preserves_old_loans_and_can_repeat():
    engine = create_engine("sqlite+pysqlite://")
    legacy = MetaData()
    for table in Base.metadata.sorted_tables:
        if table.name not in {"member_applications", "member_account_actions"}:
            Table(table.name, legacy, *[column._copy() for column in table.columns
                if column.name not in NEW_COLUMNS.get(table.name, set())])
    legacy.create_all(engine)
    with engine.begin() as connection:
        connection.execute(legacy.tables["users"].insert().values(
            id=901, name="Synthetic legacy reader", password_hash="unused", role="member", status="active"))
        connection.execute(legacy.tables["books"].insert().values(
            id=902, title="Synthetic legacy title", author="Synthetic", category="General", copies_total=1, copies_available=0))
        connection.execute(legacy.tables["book_copies"].insert().values(
            id=903, book_id=902, copy_number=1, qr_code="SYNTHETIC-LEGACY-COPY", status="borrowed"))
        connection.execute(legacy.tables["transactions"].insert().values(
            id=904, user_id=901, book_id=902, copy_id=903, type="borrow", status="active",
            borrow_date=now_ph(), fine_amount=0))
        for _ in range(2):
            Base.metadata.create_all(connection)
            upgrade_schema(connection, Base.metadata)
        assert connection.execute(text("SELECT is_borrowable FROM books WHERE id=902")).scalar() == 1
        assert connection.execute(text("SELECT is_blacklisted FROM users WHERE id=901")).scalar() == 0
        loan = connection.execute(text("SELECT id, copy_id, status, return_condition, inspected_at, condition_fee FROM transactions WHERE id=904")).one()
        assert tuple(loan) == (904, 903, "active", None, None, 0)
        assert connection.execute(text("SELECT qr_code, status, condition FROM book_copies WHERE id=903")).one() == ("SYNTHETIC-LEGACY-COPY", "borrowed", None)
        for name in ("member_applications", "member_account_actions"):
            assert name in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT count(*) FROM users")).scalar() == 1
    engine.dispose()
