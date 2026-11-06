# Privacy information and encrypted biometric storage

Production rollout and its verification are recorded in the
[November 6 release record](RELEASE_2026-11-06.md); deployment does not establish legal
approval. `/privacy-policy` explains actual processing and unresolved policy items.
The landing copyright row and entrance station link to it. The station shows its
notice before camera access, requires an operator start, and pauses when hidden.
Starting a station is **not patron consent**; continuous scanning still processes
unidentified faces. No consent ledger, retention schedule or new deletion policy
is introduced. PAD, authentication algorithms and matching thresholds are unchanged.

## Storage boundary

`BiometricText` stores authenticated AES-256-GCM ciphertext in the existing TEXT
columns `users.face_encoding`, `face_embeddings.embedding` (including inactive
rows), and `security_alerts.snapshot_b64`. No schema upgrade is needed. Normal
ORM reads decrypt in server memory; ORM inserts, updates and bulk updates encrypt.
Recognition still receives the existing JSON and image formats. Password sign-in
does not load the deferred legacy face column. NULL/empty enrollment checks and
authorized deletion remain supported; ciphertext must not be compared for equality.

Each value uses a fresh 96-bit random nonce and a 128-bit authentication tag.
The `rplbio:v1:<key-id>:<base64>` envelope identifies the decryption key. Version,
key ID and table/column context are authenticated. Values cannot be moved between
these columns without rejection. Row identity is not part of the authenticated
context: this protects against database disclosure and ciphertext corruption, not
an attacker with arbitrary database write access replaying values within a column.
Preserve database authorization, restricted runtime credentials and audit controls.

Keys are server environment secrets, separate from database contents and JWTs.
Encryption does not protect an already compromised API process, process memory,
an authorized recipient, or historical plaintext backups. Profile/ID files remain
in private Storage categories under existing access controls; this change does not
add application encryption to uploaded files or certify provider encryption.
Normal patron responses do not expose templates, ciphertext or snapshots.

See the [cryptography AES-GCM documentation](https://cryptography.io/en/latest/hazmat/primitives/aead/).

## Server configuration

Never put these variables in `VITE_*`, browser storage, source control or logs:

| Variable | Meaning |
| --- | --- |
| `BIOMETRIC_ENCRYPTION_MODE` | `legacy`, `transition`, or `strict` |
| `BIOMETRIC_ENCRYPTION_KEYS` | JSON object mapping nonsecret key IDs to base64-encoded, independently generated 32-byte random keys |
| `BIOMETRIC_ENCRYPTION_ACTIVE_KEY_ID` | Key ID used for new writes |

`legacy` is the default only outside production. It preserves development fixtures
without keys; supplying keys in legacy mode is rejected. Production defaults to
`strict` and rejects legacy mode. `transition` always encrypts new writes and allows
existing plaintext reads. `strict` encrypts writes and rejects nonempty plaintext.
Both require a valid active key; malformed settings, missing decryption keys and
authentication failures never silently fall back to plaintext. API errors contain
no keys, templates or SQL parameters. A corrupt template can make a matching or
profile operation unavailable; investigate it without discarding patron data.

Generate keys in an approved private secret-management workflow using a secure
random generator (32 bytes, base64 encoding). Do not reuse passwords or JWT keys,
paste keys into chat, or generate values in shared terminal transcripts. Store a
recoverable key copy separately from the database, with restricted access. Losing
the keys makes encrypted data unrecoverable. Do not request a key from the browser.

## Rollout procedure

1. Obtain approval for the target, maintenance window, migration and deployment.
   Confirm the library's responsible organization, lawful processing basis,
   non-biometric assistance, retention, provider arrangements, minors procedure and
   privacy contact. The informational page identifies outstanding items; it is not
   a substitute for an approved collection procedure or consent where required.
2. Verify a restorable database backup and separate key recovery. Rehearse the
   complete procedure on an isolated database using synthetic records. Keep
   `AUTO_MIGRATE=false`; this utility never runs automatically at API startup.
3. Pause biometric enrollment, matching and other writers for the maintenance
   window. Drain old API instances and eliminate deployments/scripts still able
   to write plaintext. Deploy this reader/writer code with the keyring and
   `transition` mode. Do not roll back to older code after ciphertext is written.
4. In a controlled terminal, select the intended database through the existing
   server configuration. From `backend/`, run the read-only audit:
   `uv run python biometric_storage_migrate.py`.
   It authenticates every encrypted value and reports aggregate counts only.
5. After verifying the target and recovery, run:
   `uv run python biometric_storage_migrate.py --apply --acknowledge-backup`.
   Batches are transactional (default 100 rows); PostgreSQL takes row locks.
   A compare-and-update guard rejects concurrent changes. NULL/empty fields stay
   unchanged. Earlier committed batches survive interruption; rerunning is safe.
   The acknowledgment flag is an operator assertion, not a backup verification.
6. Run the audit again. All three fields must report zero `plaintext` and `old_key`
   values. Review encrypted counts; audit failure is a release blocker. Verify
   login, recognition, staff enrollment/reset, spoof-alert storage and authorized
   deletion using approved synthetic accounts, not real patron exports.
7. Set `strict`, redeploy, verify the flows again, then resume service. Keep the
   same keyring on every API instance. Record completion without row data or keys.
   Database/backup recovery must be rehearsed before the live migration; SQLite
   tests do not establish Supabase transaction-pooler or PostgreSQL locking behavior.

## Rotation and recovery

Add a new independent key under a new ID, retaining old keys. First distribute
the expanded keyring to **all** readers while keeping the old active key; only
then switch writers to the new active ID. Run the same audit/apply utility to
rewrap values. Audit must show zero old-key values before removing an old key from
the live runtime. Preserve old keys in restricted recovery storage for backups
that still require them. Never replace key bytes under an existing key ID.

On failure, stop rollout, retain every required key and investigate privately.
The utility emits aggregate counts or a generic failure, never row identifiers or
payloads. A failed batch rolls back; earlier batches may already be encrypted.
Recover with this encryption-aware code and the correct keyring, or restore a
verified backup under an approved recovery plan. Do not decrypt the whole database
as an automatic rollback, purge unreadable rows, or restore an old API against a
partially encrypted database. Historical backups require their own approved
retention and access policy.
