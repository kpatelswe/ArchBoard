import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class BoardSummary(BaseModel):
    """Board without its graph — for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    version: int
    created_at: datetime
    updated_at: datetime


class BoardRead(BoardSummary):
    current_snapshot: dict[str, Any]
