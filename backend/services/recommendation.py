"""
Recommendation engine — no ML training needed.

Two signals combined:
  1. Personalized  — user's top borrowed categories → suggest unread books in those categories
  2. Trending      — most borrowed globally in last 30 days → suggest ones user hasn't read

Final list = personalized first, then trending to fill up to `limit`.
"""
from datetime import datetime, timedelta

from timezone_utils import now_ph
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from models.book import Book
from models.transaction import Transaction


def get_recommendations(user_id: int, db: Session, limit: int = 10) -> list[dict]:
    # ── Books this user has already borrowed (exclude from suggestions) ────────
    already_read_ids = {
        row.book_id
        for row in db.query(Transaction.book_id)
        .filter(Transaction.user_id == user_id, Transaction.borrow_date.isnot(None))
        .all()
    }

    # ── Signal 1: user's top 3 categories ────────────────────────────────────
    top_categories = (
        db.query(Book.category, func.count(Transaction.id).label("cnt"))
        .join(Transaction, Transaction.book_id == Book.id)
        .filter(Transaction.user_id == user_id, Transaction.borrow_date.isnot(None))
        .group_by(Book.category)
        .order_by(desc("cnt"))
        .limit(3)
        .all()
    )

    personalized = []
    seen_ids     = set(already_read_ids)

    for cat_row in top_categories:
        books = (
            db.query(Book)
            .filter(
                Book.category == cat_row.category,
                Book.id.notin_(seen_ids),
                Book.copies_available > 0,
            )
            .order_by(func.random())
            .limit(4)
            .all()
        )
        for b in books:
            if b.id not in seen_ids:
                personalized.append({
                    "id":               b.id,
                    "title":            b.title,
                    "author":           b.author,
                    "category":         b.category,
                    "cover_url":        b.cover_url,
                    "copies_available": b.copies_available,
                    "reason":           f"Because you enjoy {b.category}",
                })
                seen_ids.add(b.id)
        if len(personalized) >= limit:
            break

    if len(personalized) >= limit:
        return personalized[:limit]

    # ── Signal 2: globally trending (last 30 days) — fill remaining slots ────
    since = now_ph() - timedelta(days=30)

    trending_ids = (
        db.query(Transaction.book_id, func.count(Transaction.id).label("borrows"))
        .filter(Transaction.borrow_date >= since)
        .group_by(Transaction.book_id)
        .order_by(desc("borrows"))
        .limit(30)
        .all()
    )

    needed = limit - len(personalized)
    for row in trending_ids:
        if row.book_id in seen_ids:
            continue
        b = db.query(Book).filter(Book.id == row.book_id).first()
        if not b:
            continue
        personalized.append({
            "id":               b.id,
            "title":            b.title,
            "author":           b.author,
            "category":         b.category,
            "cover_url":        b.cover_url,
            "copies_available": b.copies_available,
            "reason":           "Trending this month",
        })
        seen_ids.add(b.id)
        needed -= 1
        if needed == 0:
            break

    # ── Fallback: newest books if no history and nothing trending yet ─────────
    if not personalized:
        newest = (
            db.query(Book)
            .filter(Book.id.notin_(already_read_ids))
            .order_by(desc(Book.created_at))
            .limit(limit)
            .all()
        )
        for b in newest:
            personalized.append({
                "id":               b.id,
                "title":            b.title,
                "author":           b.author,
                "category":         b.category,
                "cover_url":        b.cover_url,
                "copies_available": b.copies_available,
                "reason":           "New in the library",
            })

    return personalized[:limit]
