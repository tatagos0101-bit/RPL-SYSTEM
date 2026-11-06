from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class AcquisitionDetails(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source: Literal['purchased', 'donated', 'other'] | None = None
    acquired_on: date | None = None
    party: str | None = Field(None, max_length=180)
    cost: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    currency: str | None = Field(None, pattern=r'^[A-Z]{3}$')
    reference: str | None = Field(None, max_length=255)

    @model_validator(mode='after')
    def validate_cost(self):
        from timezone_utils import now_ph
        if self.acquired_on and self.acquired_on > now_ph().date():
            raise ValueError('Acquisition date cannot be in the future.')
        if self.cost is not None and not self.currency:
            raise ValueError('Currency is required when a cost is recorded.')
        return self
