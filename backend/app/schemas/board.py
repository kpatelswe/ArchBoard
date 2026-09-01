import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.snapshot import BoardSnapshot


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


class BoardSnapshotUpdate(BaseModel):
    """A save attempt. `version` is the version the client last read."""

    snapshot: BoardSnapshot
    version: int = Field(ge=1)


class BoardConflict(BaseModel):
    """Returned with 409 so the client can reconcile without a second fetch."""

    detail: str = "board was modified by someone else"
    current: BoardRead
