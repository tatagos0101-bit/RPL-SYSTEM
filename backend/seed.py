"""
seed.py — Bootstrap the Rizal Provincial Library database.

Local demo use only. Set SEED_LIBRARIAN_PASSWORD and SEED_MEMBER_PASSWORD
in your ignored environment file before running:
    python seed.py

Creates:
  - 1 default librarian account
  - 1 default test member account
  - 30 sample books across 6 categories
  - Default reading goals for the test member
  - Skips everything if data already exists (idempotent)
"""
import sys
import os

# Allow running from any working directory
sys.path.insert(0, os.path.dirname(__file__))

from services.passwords import hash_password
from database import SessionLocal, init_db
from config import DATABASE_URL, ENVIRONMENT
from sqlalchemy.engine import make_url
from models.user import User
from models.book import Book
from models.reading_goal import ReadingGoal
from models.security_alert import SecurityAlert
from services.qr_service import make_qr_code




# ── Default accounts ──────────────────────────────────────────────────────────

LIBRARIAN = {
    "name":          "Head Librarian",
    "email":         "librarian@rizallib.gov.ph",
    "password":      os.getenv("SEED_LIBRARIAN_PASSWORD", ""),
    "role":          "librarian",
}

TEST_MEMBER = {
    "name":          "Juan Dela Cruz",
    "email":         "juan@example.com",
    "password":      os.getenv("SEED_MEMBER_PASSWORD", ""),
    "role":          "member",
    "phone":         "+63 912 345 6789",
    "location":      "Taytay, Rizal",
}


# ── Sample books ──────────────────────────────────────────────────────────────

SAMPLE_BOOKS = [
    # Philippine Literature
    {
        "title": "Noli Me Tangere",
        "author": "Jose Rizal",
        "category": "Philippine Literature",
        "year": 1887,
        "isbn": "978-971-10-1423-7",
        "copies_total": 5,
        "location_shelf": "PHL-01",
        "cover_url": "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1700902810i/200354720.jpg",
    },
    {
        "title": "El Filibusterismo",
        "author": "Jose Rizal",
        "category": "Philippine Literature",
        "year": 1891,
        "isbn": "978-971-10-1424-4",
        "copies_total": 5,
        "location_shelf": "PHL-01",
        "cover_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/El_filibusterismo_cover.jpg/220px-El_filibusterismo_cover.jpg",
    },
    {
        "title": "Florante at Laura",
        "author": "Francisco Balagtas",
        "category": "Philippine Literature",
        "year": 1838,
        "isbn": "978-971-10-1425-1",
        "copies_total": 3,
        "location_shelf": "PHL-01",
    },
    {
        "title": "Ibong Adarna",
        "author": "Anonymous",
        "category": "Philippine Literature",
        "year": 1700,
        "copies_total": 4,
        "location_shelf": "PHL-02",
    },
    {
        "title": "Mga Kwento ni Lola Basyang",
        "author": "Severino Reyes",
        "category": "Philippine Literature",
        "year": 1925,
        "copies_total": 3,
        "location_shelf": "PHL-02",
    },

    # Self-Help
    {
        "title": "Atomic Habits",
        "author": "James Clear",
        "category": "Self-Help",
        "year": 2018,
        "isbn": "978-0-7352-1129-2",
        "copies_total": 4,
        "location_shelf": "SH-01",
        "cover_url": "https://m.media-amazon.com/images/I/91bYsX41DVL.jpg",
    },
    {
        "title": "The 7 Habits of Highly Effective People",
        "author": "Stephen R. Covey",
        "category": "Self-Help",
        "year": 1989,
        "isbn": "978-1-4516-7963-8",
        "copies_total": 3,
        "location_shelf": "SH-01",
        "cover_url": "https://m.media-amazon.com/images/I/71gF8SiJaDL.jpg",
    },
    {
        "title": "Think and Grow Rich",
        "author": "Napoleon Hill",
        "category": "Self-Help",
        "year": 1937,
        "isbn": "978-1-58542-433-2",
        "copies_total": 3,
        "location_shelf": "SH-02",
    },
    {
        "title": "The Power of Now",
        "author": "Eckhart Tolle",
        "category": "Self-Help",
        "year": 1997,
        "isbn": "978-1-57731-480-6",
        "copies_total": 2,
        "location_shelf": "SH-02",
    },
    {
        "title": "Deep Work",
        "author": "Cal Newport",
        "category": "Self-Help",
        "year": 2016,
        "isbn": "978-1-4555-8669-1",
        "copies_total": 2,
        "location_shelf": "SH-02",
        "cover_url": "https://m.media-amazon.com/images/I/71ub5zRIIhL.jpg",
    },

    # Classic Fiction
    {
        "title": "1984",
        "author": "George Orwell",
        "category": "Classic Fiction",
        "year": 1949,
        "isbn": "978-0-452-28423-4",
        "copies_total": 4,
        "location_shelf": "CF-01",
        "cover_url": "https://d30a6s96kk7rhm.cloudfront.net/original/readings/978/014/103/9780141036144.jpg",
    },
    {
        "title": "Brave New World",
        "author": "Aldous Huxley",
        "category": "Classic Fiction",
        "year": 1932,
        "isbn": "978-0-06-085052-4",
        "copies_total": 3,
        "location_shelf": "CF-01",
    },
    {
        "title": "To Kill a Mockingbird",
        "author": "Harper Lee",
        "category": "Classic Fiction",
        "year": 1960,
        "isbn": "978-0-06-112008-4",
        "copies_total": 3,
        "location_shelf": "CF-01",
    },
    {
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "category": "Classic Fiction",
        "year": 1925,
        "isbn": "978-0-7432-7356-5",
        "copies_total": 2,
        "location_shelf": "CF-02",
    },
    {
        "title": "Pride and Prejudice",
        "author": "Jane Austen",
        "category": "Classic Fiction",
        "year": 1813,
        "isbn": "978-0-14-143951-8",
        "copies_total": 3,
        "location_shelf": "CF-02",
    },

    # Non-Fiction / History
    {
        "title": "Sapiens: A Brief History of Humankind",
        "author": "Yuval Noah Harari",
        "category": "Non-Fiction",
        "year": 2011,
        "isbn": "978-0-06-231609-7",
        "copies_total": 4,
        "location_shelf": "NF-01",
        "cover_url": "https://m.media-amazon.com/images/I/71l-ShCIFXL.jpg",
    },
    {
        "title": "Homo Deus",
        "author": "Yuval Noah Harari",
        "category": "Non-Fiction",
        "year": 2015,
        "isbn": "978-0-06-246431-6",
        "copies_total": 3,
        "location_shelf": "NF-01",
    },
    {
        "title": "The Philippines: A History",
        "author": "Renato Constantino",
        "category": "Non-Fiction",
        "year": 1975,
        "copies_total": 4,
        "location_shelf": "NF-02",
    },
    {
        "title": "A History of the Filipino People",
        "author": "Teodoro Agoncillo",
        "category": "Non-Fiction",
        "year": 1990,
        "copies_total": 3,
        "location_shelf": "NF-02",
    },
    {
        "title": "Thinking, Fast and Slow",
        "author": "Daniel Kahneman",
        "category": "Non-Fiction",
        "year": 2011,
        "isbn": "978-0-374-27563-1",
        "copies_total": 2,
        "location_shelf": "NF-03",
    },

    # Science & Technology
    {
        "title": "A Brief History of Time",
        "author": "Stephen Hawking",
        "category": "Science",
        "year": 1988,
        "isbn": "978-0-553-38016-3",
        "copies_total": 3,
        "location_shelf": "SCI-01",
    },
    {
        "title": "The Gene: An Intimate History",
        "author": "Siddhartha Mukherjee",
        "category": "Science",
        "year": 2016,
        "isbn": "978-1-4767-3352-4",
        "copies_total": 2,
        "location_shelf": "SCI-01",
    },
    {
        "title": "Cosmos",
        "author": "Carl Sagan",
        "category": "Science",
        "year": 1980,
        "isbn": "978-0-345-33135-9",
        "copies_total": 2,
        "location_shelf": "SCI-02",
    },

    # Business & Finance
    {
        "title": "Rich Dad Poor Dad",
        "author": "Robert Kiyosaki",
        "category": "Business",
        "year": 1997,
        "isbn": "978-1-5127-3949-9",
        "copies_total": 4,
        "location_shelf": "BUS-01",
        "cover_url": "https://m.media-amazon.com/images/I/81bsw6fnUiL.jpg",
    },
    {
        "title": "The Intelligent Investor",
        "author": "Benjamin Graham",
        "category": "Business",
        "year": 1949,
        "isbn": "978-0-06-055566-5",
        "copies_total": 3,
        "location_shelf": "BUS-01",
    },
    {
        "title": "Zero to One",
        "author": "Peter Thiel",
        "category": "Business",
        "year": 2014,
        "isbn": "978-0-8041-3929-8",
        "copies_total": 2,
        "location_shelf": "BUS-02",
    },
    {
        "title": "The Lean Startup",
        "author": "Eric Ries",
        "category": "Business",
        "year": 2011,
        "isbn": "978-0-307-88791-7",
        "copies_total": 2,
        "location_shelf": "BUS-02",
    },
    {
        "title": "The Alchemist",
        "author": "Paulo Coelho",
        "category": "Classic Fiction",
        "year": 1988,
        "isbn": "978-0-06-112241-5",
        "copies_total": 5,
        "location_shelf": "CF-03",
        "cover_url": "https://m.media-amazon.com/images/I/71aFt4+OTOL.jpg",
    },
    {
        "title": "Man's Search for Meaning",
        "author": "Viktor E. Frankl",
        "category": "Non-Fiction",
        "year": 1946,
        "isbn": "978-0-8070-1427-1",
        "copies_total": 3,
        "location_shelf": "NF-04",
    },
    {
        "title": "The Little Prince",
        "author": "Antoine de Saint-Exupéry",
        "category": "Classic Fiction",
        "year": 1943,
        "isbn": "978-0-15-646439-0",
        "copies_total": 4,
        "location_shelf": "CF-03",
    },
]

DEFAULT_GOALS = [
    {"goal_type": "annual_books", "target": 20, "label": "Books This Year"},
    {"goal_type": "genres",       "target": 8,  "label": "Unique Genres"},
    {"goal_type": "visits",       "target": 22, "label": "Visits This Month"},
]


# ── Seeding logic ─────────────────────────────────────────────────────────────

def validate_seed_target():
    """Demo data belongs only in an explicitly configured local test database."""
    url = make_url(DATABASE_URL)
    if ENVIRONMENT not in {"development", "test"} or (url.get_backend_name() != "sqlite" and url.host not in {"localhost", "127.0.0.1", "::1"}):
        raise RuntimeError("Demo seeding is permitted only in a local development/test database.")
    for account in (LIBRARIAN, TEST_MEMBER):
        password = account["password"]
        if len(password) < 16 or len(password.encode("utf-8")) > 72:
            raise RuntimeError("Set both SEED_LIBRARIAN_PASSWORD and SEED_MEMBER_PASSWORD to unique passwords of 16-72 bytes.")


def seed():
    validate_seed_target()
    print("Initializing database tables...")
    init_db()
    print("[OK] Tables ready")

    db = SessionLocal()
    try:
        # ── Librarian ─────────────────────────────────────────────────────────
        if not db.query(User).filter(User.email == LIBRARIAN["email"]).first():
            lib = User(
                name          = LIBRARIAN["name"],
                email         = LIBRARIAN["email"],
                password_hash = hash_password(LIBRARIAN["password"]),
                role          = "librarian",
                status        = "active",
            )
            db.add(lib)
            db.commit()
            print("[OK] Local demo librarian created")
        else:
            print(f"  Librarian already exists — skipping")

        # ── Test member ───────────────────────────────────────────────────────
        member = db.query(User).filter(User.email == TEST_MEMBER["email"]).first()
        if not member:
            member = User(
                name          = TEST_MEMBER["name"],
                email         = TEST_MEMBER["email"],
                password_hash = hash_password(TEST_MEMBER["password"]),
                role          = "member",
                phone         = TEST_MEMBER["phone"],
                location      = TEST_MEMBER["location"],
                status        = "active",
            )
            db.add(member)
            db.commit()
            db.refresh(member)
            print("[OK] Local demo member created")
        else:
            print(f"  Test member already exists — skipping")

        # ── Default reading goals for the member ──────────────────────────────
        from timezone_utils import now_ph
        current_year = now_ph().year

        for goal_def in DEFAULT_GOALS:
            exists = db.query(ReadingGoal).filter(
                ReadingGoal.user_id   == member.id,
                ReadingGoal.goal_type == goal_def["goal_type"],
                ReadingGoal.year      == current_year,
            ).first()
            if not exists:
                db.add(ReadingGoal(
                    user_id   = member.id,
                    goal_type = goal_def["goal_type"],
                    target    = goal_def["target"],
                    current   = 0,
                    year      = current_year,
                ))
        db.commit()
        print(f"[OK] Reading goals seeded for {member.name}")

        # ── Books ─────────────────────────────────────────────────────────────
        added   = 0
        skipped = 0

        for book_data in SAMPLE_BOOKS:
            # Check by ISBN if available, otherwise by title+author
            isbn = book_data.get("isbn")
            if isbn and db.query(Book).filter(Book.isbn == isbn).first():
                skipped += 1
                continue
            if not isbn:
                if db.query(Book).filter(
                    Book.title  == book_data["title"],
                    Book.author == book_data["author"],
                ).first():
                    skipped += 1
                    continue

            copies = book_data.get("copies_total", 1)
            book = Book(
                title            = book_data["title"],
                author           = book_data["author"],
                category         = book_data["category"],
                year             = book_data.get("year"),
                isbn             = isbn,
                copies_total     = copies,
                copies_available = copies,
                location_shelf   = book_data.get("location_shelf"),
                cover_url        = book_data.get("cover_url"),
            )
            db.add(book)
            db.flush()   # get auto-increment ID
            book.qr_code = make_qr_code(book.id)
            added += 1

        db.commit()
        print(f"[OK] Books: {added} added, {skipped} already existed")

        print("\n-------------------------------------------------")
        print("  Seed complete! You can now start the server:")
        print("  cd backend && uvicorn main:app --reload")
        print("-------------------------------------------------")
        print("\n  Use the credentials you configured in the seed environment variables.")
        print("  Passwords are never printed or written to source files.")
        print("  Librarian sign-up uses the separately configured authorization code.\n")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
