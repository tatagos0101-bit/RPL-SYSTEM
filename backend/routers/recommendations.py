"""
Recommendation, reading stats, activity heatmap, and reading goals endpoints.
"""
from datetime import datetime, timedelta

from timezone_utils import now_ph

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, extract

from database import get_db
from dependencies import get_current_user
from limiter import limiter
from models.book import Book
from models.entry_log import EntryLog
from models.reading_goal import ReadingGoal
from models.transaction import Transaction
from models.user import User
from schemas.report import RecommendedBook, ReadingStats, GenreBreakdown, ActivityDay, GoalOut, GoalUpdateIn

router = APIRouter(tags=["Recommendations & Stats"])

GOAL_LABELS = {
    "annual_books": "Books This Year",
    "genres":       "Unique Genres",
    "visits":       "Library Visits",
}


def _now() -> datetime:
    return now_ph()


# ── AI Recommendations ────────────────────────────────────────────────────────

@router.get("/api/recommendations", response_model=list[RecommendedBook])
@limiter.limit("20/minute")
def get_recommendations(
    request:      Request,
    limit:        int  = Query(10, ge=1, le=30),
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    from services.recommendation import get_recommendations as _rec
    raw = _rec(user_id=current_user.id, db=db, limit=limit)
    return [RecommendedBook(**r) for r in raw]


# ── Reading Stats (genre breakdown for donut chart) ───────────────────────────

@router.get("/api/user/reading-stats", response_model=ReadingStats)
def reading_stats(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    rows = (
        db.query(Book.category, func.count(Transaction.id).label("cnt"))
        .join(Transaction, Transaction.book_id == Book.id)
        .filter(Transaction.user_id == current_user.id, Transaction.borrow_date.isnot(None))
        .group_by(Book.category)
        .order_by(desc("cnt"))
        .all()
    )

    total_books = sum(r.cnt for r in rows)
    genres = []
    for r in rows:
        genres.append(GenreBreakdown(
            category   = r.category,
            count      = r.cnt,
            percentage = round((r.cnt / total_books * 100), 1) if total_books else 0,
        ))

    total_visits = (
        db.query(func.count(EntryLog.id))
        .filter(EntryLog.user_id == current_user.id)
        .scalar()
    )

    favorite = genres[0].category if genres else None

    return ReadingStats(
        total_books_read  = total_books,
        total_visits      = total_visits,
        favorite_category = favorite,
        genres            = genres,
    )


# ── Activity Heatmap (last 84 days of visits) ────────────────────────────────

@router.get("/api/user/activity", response_model=list[ActivityDay])
def activity_heatmap(
    days:         int  = Query(84, ge=7, le=365),
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    since = _now() - timedelta(days=days)
    day_expression = func.date(EntryLog.accessed_at)
    if db.get_bind().dialect.name == "postgresql":
        day_expression = func.date(func.timezone("Asia/Manila", EntryLog.accessed_at))

    logs = (
        db.query(
            day_expression.label("day"),
            func.count(EntryLog.id).label("cnt"),
        )
        .filter(EntryLog.user_id == current_user.id, EntryLog.accessed_at >= since)
        .group_by(day_expression)
        .all()
    )

    visit_map = {str(row.day): row.cnt for row in logs}

    result = []
    for i in range(days - 1, -1, -1):
        day    = (_now() - timedelta(days=i)).date()
        day_str = str(day)
        visits = visit_map.get(day_str, 0)

        # 0 = none, 1 = 1 visit, 2 = 2, 3 = 3, 4 = 4+
        intensity = min(visits, 4)

        result.append(ActivityDay(date=day_str, visits=visits, intensity=intensity))

    return result


# ── Reading Goals ─────────────────────────────────────────────────────────────

@router.get("/api/user/goals", response_model=list[GoalOut])
def reading_goals(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    year   = _now().year
    year_start = _now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    year_end = year_start.replace(year=year + 1)
    goals  = db.query(ReadingGoal).filter(
        ReadingGoal.user_id == current_user.id,
        ReadingGoal.year    == year,
    ).all()

    # Auto-compute current progress from real data
    result = []
    for g in goals:
        current = g.current   # default: stored value

        if g.goal_type == "annual_books":
            current = (
                db.query(func.count(Transaction.id))
                .filter(
                    Transaction.user_id == current_user.id,
                    Transaction.borrow_date.isnot(None),
                    Transaction.borrow_date >= year_start,
                    Transaction.borrow_date < year_end,
                )
                .scalar()
            )
        elif g.goal_type == "genres":
            current = (
                db.query(func.count(Book.category.distinct()))
                .join(Transaction, Transaction.book_id == Book.id)
                .filter(
                    Transaction.user_id == current_user.id,
                    Transaction.borrow_date.isnot(None),
                    Transaction.borrow_date >= year_start,
                    Transaction.borrow_date < year_end,
                )
                .scalar()
            )
        elif g.goal_type == "visits":
            current = (
                db.query(func.count(EntryLog.id))
                .filter(
                    EntryLog.user_id == current_user.id,
                    EntryLog.accessed_at >= year_start,
                    EntryLog.accessed_at < year_end,
                )
                .scalar()
            )

        # Save computed value back
        g.current = current
        result.append(GoalOut(
            id        = g.id,
            goal_type = g.goal_type,
            label     = GOAL_LABELS.get(g.goal_type, g.goal_type),
            target    = g.target,
            current   = current,
            year      = g.year,
            percent   = round(min(current / g.target * 100, 100), 1) if g.target else 0,
        ))

    db.commit()
    return result


# ── Update Reading Goals ───────────────────────────────────────────────────────

@router.put("/api/user/goals", response_model=list[GoalOut])
def update_goals(
    body:         GoalUpdateIn,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    year = _now().year
    updates = {
        "annual_books": body.annual_books,
        "genres":       body.genres,
        "visits":       body.visits,
    }
    for goal_type, target in updates.items():
        existing = db.query(ReadingGoal).filter(
            ReadingGoal.user_id   == current_user.id,
            ReadingGoal.goal_type == goal_type,
            ReadingGoal.year      == year,
        ).first()
        if existing:
            existing.target = target
        else:
            db.add(ReadingGoal(
                user_id   = current_user.id,
                goal_type = goal_type,
                target    = target,
                current   = 0,
                year      = year,
            ))
    db.commit()
    return reading_goals(current_user=current_user, db=db)
