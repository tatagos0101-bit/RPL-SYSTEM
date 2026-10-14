from pydantic import BaseModel, Field


class StationPinStatus(BaseModel):
    configured: bool


class StationPinUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=128, repr=False)
    new_pin: str = Field(min_length=6, max_length=12, pattern=r"^[0-9]+$", repr=False)
