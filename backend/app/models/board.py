import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

EMPTY_GRAPH: dict[str, list[Any]] = {"nodes": [], "edges": []}


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))

    # The React Flow graph, stored verbatim so no translation layer is needed.
    current_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{\"nodes\": [], \"edges\": []}'::jsonb")
    )

    # Incremented on every snapshot write; clients send the version they read so
    # a concurrent save is rejected rather than silently overwriting.
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))

    # Encoded Yjs CRDT document — the merge-authoritative form of the board.
    # current_snapshot stays the materialized JSON view (REST reads, analyzer).
    # NULL means "no CRDT history yet": the next live session seeds a fresh
    # doc from current_snapshot (a REST save clears it for the same reason).
    ydoc_state: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
