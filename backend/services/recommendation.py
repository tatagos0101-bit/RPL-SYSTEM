"""On-demand item collaborative filtering with content and popularity fallbacks.

Binary per-member signals (borrow=5, favorite=3, view=1) prevent click/loan
frequency from dominating. SQL aggregates compute only similarities to this
member's seed books, never a dense member-by-book matrix in application memory.
"""
from datetime import timedelta

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session

from models.book import Book
from models.book_interaction import BookInteraction
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from timezone_utils import now_ph


def _signals(since=None):
    feedback = select(
        BookInteraction.user_id.label("user_id"), BookInteraction.book_id.label("book_id"),
        (case((BookInteraction.is_favorite.is_(True), 3), else_=0)
         + case(((BookInteraction.viewed_at >= since) if since else
                 BookInteraction.viewed_at.isnot(None), 1), else_=0)).label("weight"),
    )
    loans = select(Transaction.user_id, Transaction.book_id, literal(5).label("weight")).where(
        (Transaction.borrow_date >= since) if since else Transaction.borrow_date.isnot(None),
    ).distinct()
    events = union_all(feedback, loans).subquery()
    return select(events.c.user_id, events.c.book_id, func.sum(events.c.weight).label("weight")).join(
        User, User.id == events.c.user_id,
    ).where(User.role == "member", User.status == "active").group_by(
        events.c.user_id, events.c.book_id,
    ).having(func.sum(events.c.weight) > 0)


def get_recommendations(user_id: int, db: Session, limit: int = 10) -> list[dict]:
    signals = _signals().cte("signals")
    seeds = select(signals.c.book_id, signals.c.weight).where(signals.c.user_id == user_id).cte("seeds")
    # The target member supplies seeds, not evidence of other readers' interests.
    norms = select(signals.c.book_id, func.sum(signals.c.weight * signals.c.weight).label("norm2")).where(
        signals.c.user_id != user_id,
    ).group_by(
        signals.c.book_id,
    ).cte("norms")
    source = signals.alias("source")
    target = signals.alias("target")
    pairs = select(
        source.c.book_id.label("seed_id"), target.c.book_id.label("book_id"),
        func.sum(source.c.weight * target.c.weight).label("dot"),
    ).select_from(source).join(seeds, seeds.c.book_id == source.c.book_id).join(
        target, (target.c.user_id == source.c.user_id) & (target.c.book_id != source.c.book_id),
    ).where(source.c.user_id != user_id).group_by(source.c.book_id, target.c.book_id).cte("pairs")
    seed_norm = norms.alias("seed_norm")
    collaborative = select(pairs.c.book_id, func.sum(
        seeds.c.weight * pairs.c.dot / func.sqrt(seed_norm.c.norm2 * norms.c.norm2 * 1.0),
    ).label("score")).join(seeds, seeds.c.book_id == pairs.c.seed_id).join(
        seed_norm, seed_norm.c.book_id == pairs.c.seed_id,
    ).join(norms, norms.c.book_id == pairs.c.book_id).group_by(pairs.c.book_id).cte("collaborative")

    categories = select(Book.category, func.sum(seeds.c.weight).label("score")).join(
        seeds, seeds.c.book_id == Book.id,
    ).group_by(Book.category).cte("categories")
    authors = select(Book.author, func.sum(seeds.c.weight).label("score")).join(
        seeds, seeds.c.book_id == Book.id,
    ).group_by(Book.author).cte("authors")
    recent = _signals(now_ph() - timedelta(days=30)).cte("recent")
    popularity = select(recent.c.book_id, func.sum(recent.c.weight).label("score")).group_by(
        recent.c.book_id,
    ).cte("popularity")
    cf_score = func.coalesce(collaborative.c.score, 0)
    content_score = func.coalesce(categories.c.score, 0) + func.coalesce(authors.c.score, 0)
    popular_score = func.coalesce(popularity.c.score, 0)
    tier = case((cf_score > 0, 0), (content_score > 0, 1), (popular_score > 0, 2), else_=3)
    borrowed = select(Transaction.book_id).where(
        Transaction.user_id == user_id, Transaction.borrow_date.isnot(None),
    )
    reserved = select(Reservation.book_id).where(
        Reservation.user_id == user_id, Reservation.status.in_(["pending", "ready"]),
    )
    rows = db.execute(select(Book, tier.label("tier")).outerjoin(
        collaborative, collaborative.c.book_id == Book.id,
    ).outerjoin(categories, categories.c.category == Book.category).outerjoin(
        authors, authors.c.author == Book.author,
    ).outerjoin(popularity, popularity.c.book_id == Book.id).where(
        Book.id.not_in(borrowed), Book.id.not_in(reserved),
    ).order_by(
        (Book.copies_available > 0).desc(), tier, cf_score.desc(), content_score.desc(),
        popular_score.desc(), Book.created_at.desc(), Book.id.desc(),
    ).limit(limit)).all()
    explanations = [
        ("collaborative", "Readers with similar interests also explored this"),
        ("content", "Matches authors or categories you explored"),
        ("popular", "Popular with readers"),
        ("new", "New in the library"),
    ]
    return [dict(
        id=book.id, title=book.title, author=book.author, category=book.category,
        cover_url=book.cover_url, copies_available=book.copies_available,
        source=explanations[kind][0], reason=explanations[kind][1],
    ) for book, kind in rows]
