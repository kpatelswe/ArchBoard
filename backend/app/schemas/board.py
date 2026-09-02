import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.membership import BoardRole
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
    # The caller's own role, attached per-request; not a column.
    role: BoardRole | None = None


class BoardRead(BoardSummary):
    current_snapshot: dict[str, Any]


class BoardSnapshotUpdate(BaseModel):
    """A save attempt. `version` is the version the client last read."""

    snapshot: BoardSnapshot
    version: int = Field(ge=1)


class BoardConflict(BaseModel):
    detail: str = "board was modified by someone else"
    current_version: int


class InviteCreate(BaseModel):
    role: BoardRole = BoardRole.VIEWER
    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 30)


class InviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: BoardRole
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class InviteCreated(InviteRead):
    """The raw token appears here once and is never retrievable again."""

    token: str


class InviteAccept(BaseModel):
    # In the body, not the URL: paths land in access logs, bodies do not.
    token: str = Field(min_length=20, max_length=100)
