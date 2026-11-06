"""Opt-in migration rehearsal on an empty, disposable localhost database only."""
import base64
import json
import os

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, Text, create_engine, inspect, text
from sqlalchemy.engine import make_url

from biometric_storage_migrate import FIELDS, migrate
from services.biometric_crypto import decrypt


def test_postgres_biometric_backfill_and_rotation(monkeypatch):
    address = os.getenv("BIOMETRIC_TEST_DATABASE_URL")
    if not address:
        pytest.skip("Requires empty disposable localhost rpl_biometric_test PostgreSQL")
    url = make_url(address)
    assert url.get_backend_name() == "postgresql"
    assert url.host in {"localhost", "127.0.0.1"} and url.database == "rpl_biometric_test"
    engine = create_engine(url, hide_parameters=True, connect_args={"connect_timeout": 5})
    assert not inspect(engine).get_table_names(), "Use an empty disposable database"
    keys = {name: base64.urlsafe_b64encode(os.urandom(32)).decode() for name in ("old", "new")}
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_MODE", "transition")
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEYS", json.dumps(keys))
    monkeypatch.setenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "old")
    metadata = MetaData()
    for table, column in FIELDS:
        Table(table, metadata, Column("id", Integer, primary_key=True), Column(column, Text))
    metadata.create_all(engine)
    try:
        with engine.begin() as conn:
            for table, column in FIELDS:
                conn.execute(text(f"INSERT INTO {table} (id, {column}) VALUES (:id, :value)"),
                             [{"id": 1, "value": "synthetic"}, {"id": 2, "value": None}])
        assert all(c["plaintext"] == 1 for c in migrate(engine).values())
        assert all(c["rewritten"] == 1 for c in migrate(engine, apply=True, batch_size=1).values())
        assert all(c["rewritten"] == 0 for c in migrate(engine, apply=True).values())
        monkeypatch.setenv("BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID", "new")
        assert all(c["rewritten"] == 1 for c in migrate(engine, apply=True).values())
        monkeypatch.setenv("BIOMETRIC_ENCRYPTION_MODE", "strict")
        monkeypatch.setenv("BIOMETRIC_ENCRYPTION_KEYS", json.dumps({"new": keys["new"]}))
        with engine.connect() as conn:
            for table, column in FIELDS:
                rows = conn.execute(text(f"SELECT {column} FROM {table} ORDER BY id")).scalars().all()
                assert decrypt(rows[0], f"{table}.{column}") == "synthetic" and rows[1] is None
    finally:
        metadata.drop_all(engine)
        engine.dispose()
