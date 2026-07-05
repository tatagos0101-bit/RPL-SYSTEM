from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal

_VALID_REASONS = {"damaged", "wrong_book", "lost", "other"}


class GenreBreakdown(BaseModel):
    category:   str
    count:      int
    percentage: float


class ReadingStats(BaseModel):
    total_books_read:  int
    total_visits:      int
    favorite_category: Optional[str]
    genres:            list[GenreBreakdown]


class ActivityDay(BaseModel):
    date:      str    # "YYYY-MM-DD"
    visits:    int
    intensity: int    # 0-4 for heatmap shading


class GoalOut(BaseModel):
    id:        int
    goal_type: str
    label:     str
    target:    int
    current:   int
    year:      int
    percent:   float


class RecommendedBook(BaseModel):
    id:               int
    title:            str
    author:           str
    category:         str
    cover_url:        Optional[str]
    copies_available: int
    reason:           str    # "Because you read X" or "Trending this month"


class GoalUpdateIn(BaseModel):
    annual_books: int
    genres:       int
    visits:       int

    @field_validator("annual_books", "genres", "visits")
    @classmethod
    def validate_goal_target(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Goal target must be at least 1")
        if v > 10000:
            raise ValueError("Goal target must be at most 10,000")
        return v


class ReportRequest(BaseModel):
    reason: str   # "damaged" | "wrong_book" | "lost" | "other"
    note:   Optional[str] = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        v = v.strip()
        if v not in _VALID_REASONS:
            raise ValueError(f"Reason must be one of: {', '.join(sorted(_VALID_REASONS))}")
        return v

    @field_validator("note")
    @classmethod
    def validate_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 500:
            raise ValueError("Note must be at most 500 characters")
        return v or None
