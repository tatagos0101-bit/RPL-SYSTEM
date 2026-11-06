"""Audit (default), backfill or rotate biometric ciphertext. No schema changes.

Run only against an explicitly selected isolated database until production
migration is separately approved. Output contains aggregate counts only.
"""
import argparse
import json

from sqlalchemy import text

from services.biometric_crypto import PREFIX, BiometricStorageError, decrypt, encrypt, settings


FIELDS = (("users", "face_encoding"), ("face_embeddings", "embedding"), ("security_alerts", "snapshot_b64"))


def migrate(engine, *, apply=False, batch_size=100):
    config = settings()
    if config.mode == "legacy" or not 1 <= batch_size <= 1000:
        raise BiometricStorageError()
    results = {}
    for table, column in FIELDS:
        context = f"{table}.{column}"
        counts = {"plaintext": 0, "encrypted": 0, "old_key": 0, "rewritten": 0}
        cursor = 0
        while True:
            with engine.begin() as conn:
                suffix = " FOR UPDATE" if apply and conn.dialect.name == "postgresql" else ""
                rows = conn.execute(text(
                    f"SELECT id, {column} FROM {table} WHERE id > :cursor "
                    f"AND {column} IS NOT NULL AND {column} <> '' ORDER BY id LIMIT :limit{suffix}"
                ), {"cursor": cursor, "limit": batch_size}).all()
                for row_id, stored in rows:
                    encrypted = stored.startswith(PREFIX)
                    plaintext = decrypt(stored, context, config=config, allow_legacy=True)
                    old_key = encrypted and stored.split(":", 3)[2] != config.active_key_id
                    counts["encrypted" if encrypted else "plaintext"] += 1
                    counts["old_key"] += int(old_key)
                    if apply and (not encrypted or old_key):
                        replacement = encrypt(plaintext, context, config=config)
                        if decrypt(replacement, context, config=config, allow_legacy=False) != plaintext:
                            raise BiometricStorageError()
                        updated = conn.execute(text(
                            f"UPDATE {table} SET {column} = :replacement "
                            f"WHERE id = :id AND {column} = :previous"
                        ), {"replacement": replacement, "id": row_id, "previous": stored})
                        if updated.rowcount != 1:
                            raise BiometricStorageError()
                        counts["rewritten"] += 1
                    cursor = row_id
            if not rows:
                break
        results[context] = counts
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write ciphertext; default is a read-only audit.")
    parser.add_argument("--acknowledge-backup", action="store_true", help="Confirm verified recovery and approved target.")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    if args.apply and not args.acknowledge_backup:
        parser.error("--apply requires --acknowledge-backup after verifying recovery and the target.")
    try:
        # Uses existing TLS/pooler settings; does not initialize or migrate the schema.
        from database import engine
        result = migrate(engine, apply=args.apply, batch_size=args.batch_size)
        print(json.dumps({"mode": "apply" if args.apply else "audit", "counts": result}))
    except Exception:
        # SQL exceptions can include parameters. Never print tracebacks or row IDs.
        print("Biometric storage check failed; no sensitive diagnostics are emitted. Retain all keys and investigate privately.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
