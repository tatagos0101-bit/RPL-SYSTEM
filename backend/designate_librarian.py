"""Operator-only main librarian setup. No schema changes or public bootstrap API."""
import argparse

from database import SessionLocal
# Register relationship targets without starting the API or running migrations.
from models import book, book_copy, entry_log, face_embedding, reading_goal, reservation, security_alert, transaction  # noqa: F401
from models.library_settings import LibrarySetting
from services.librarian_accounts import MANAGER_SETTING_KEY, designate_librarian_manager


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--apply", action="store_true", help="Save to the configured database; otherwise roll back.")
    parser.add_argument("--replace", action="store_true", help="Explicitly replace a different existing designation.")
    args = parser.parse_args()
    with SessionLocal() as db:
        existing = db.get(LibrarySetting, MANAGER_SETTING_KEY)
        if existing is not None and existing.value != str(args.user_id) and not args.replace:
            parser.error("A different main librarian is already configured. Review it before using --replace.")
        try:
            designate_librarian_manager(db, args.user_id)
        except ValueError as error:
            parser.error(str(error))
        if args.apply:
            db.commit()
            print("Main librarian designation saved. Sign in again to refresh the staff menu.")
        else:
            db.rollback()
            print("Eligible librarian. Dry run only; no database changes were saved.")


if __name__ == "__main__":
    main()
