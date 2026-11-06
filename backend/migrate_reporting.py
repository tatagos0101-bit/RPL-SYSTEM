"""Explicit reporting-only upgrade. Run against an approved database as its owner.

Does not call migrate.py, synchronize statuses, backfill copies, or infer acquisitions.
"""
from sqlalchemy import text
from database import engine
from services.reporting_migration import upgrade_reporting_schema


def run():
    with engine.begin() as conn:
        if conn.dialect.name == 'postgresql':
            conn.execute(text('SELECT pg_advisory_xact_lock(72851001)'))
        upgrade_reporting_schema(conn)
    print('Reporting schema ready. Existing records were not backfilled.')


if __name__ == '__main__':
    run()
