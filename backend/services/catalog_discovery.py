"""Read-only catalog ranking; pagination is applied by the caller."""
from datetime import timedelta

from sqlalchemy import func

from models.book import Book
from models.book_interaction import BookInteraction
from models.transaction import Transaction
from models.user import User


def order_catalog(query, sort, favorites_only=False, *, now):
    if sort == "loved" or favorites_only:
        favorites = query.session.query(
            BookInteraction.book_id.label("book_id"),
            func.count(func.distinct(BookInteraction.user_id)).label("count"),
        ).join(User, User.id == BookInteraction.user_id).filter(
            BookInteraction.is_favorite.is_(True), User.role == "member",
            User.status == "active", User.deleted_at.is_(None),
        ).group_by(BookInteraction.book_id).subquery()
        query = query.outerjoin(favorites, favorites.c.book_id == Book.id)
        favorite_count = func.coalesce(favorites.c.count, 0)
        if favorites_only:
            query = query.filter(favorite_count > 0)
        if sort == "loved":
            return query.order_by(favorite_count.desc(), Book.created_at.desc(), Book.id.desc())
    if sort == "trending":
        recent_loans = query.session.query(
            Transaction.book_id.label("book_id"), func.count(Transaction.id).label("count"),
        ).filter(Transaction.borrow_date >= now - timedelta(days=30)).group_by(Transaction.book_id).subquery()
        return query.outerjoin(recent_loans, recent_loans.c.book_id == Book.id).order_by(
            func.coalesce(recent_loans.c.count, 0).desc(), Book.created_at.desc(), Book.id.desc(),
        )
    if sort == "newest":
        return query.order_by(Book.created_at.desc(), Book.id.desc())
    return query.order_by(Book.title, Book.id)


def category_cover_previews(db, categories):
    """At most three public artwork references per visible navigation category."""
    if not categories:
        return {}
    ranked = db.query(
        Book.id.label("book_id"), Book.category, Book.cover_url,
        func.row_number().over(partition_by=Book.category, order_by=(Book.title, Book.id)).label("preview_rank"),
    ).filter(
        Book.category.in_(categories), Book.cover_url.isnot(None), func.trim(Book.cover_url) != "",
        (Book.is_hidden.is_(False)) | (Book.category == "General"),
    ).subquery()
    previews = {category: [] for category in categories}
    for row in db.query(ranked.c.book_id, ranked.c.category, ranked.c.cover_url).filter(
        ranked.c.preview_rank <= 3,
    ).order_by(ranked.c.category, ranked.c.preview_rank).all():
        previews[row.category].append({"id": row.book_id, "cover_url": row.cover_url})
    return previews
