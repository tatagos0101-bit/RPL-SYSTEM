from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class NoticeView(BaseModel):
    id: str
    user_id: int
    member_name: str
    member_id: str | None
    last_activity_at: datetime
    inactive_days: int
    created_at: datetime
    respond_by: datetime
    status: Literal["waiting", "ready_for_review", "cancelled", "deleted"]
    delivery_channel: Literal["email", "sms", "in_app"]
    delivery_status: Literal["pending", "unknown", "accepted", "unavailable", "failed", "in_app"]
    notification_id: int | None
    message: str
    has_outstanding_loans: bool
