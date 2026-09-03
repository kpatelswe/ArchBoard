"""In-memory registry of live WebSocket connections, grouped by board.

Deliberately process-local: the PRD requires demonstrating that this breaks
across multiple backend processes before Redis pub/sub replaces the fan-out
(Day 2 Step 4). Everything here runs on one event loop, so plain dict/set
mutation is safe — there is no cross-thread access to guard.
"""

import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.models.membership import BoardRole


# eq=False keeps identity-based hashing so connections can live in sets.
@dataclass(eq=False)
class BoardConnection:
    websocket: WebSocket
    connection_id: str
    user_id: uuid.UUID
    role: BoardRole


@dataclass
class ConnectionManager:
    _boards: dict[uuid.UUID, set[BoardConnection]] = field(default_factory=dict)

    def add(self, board_id: uuid.UUID, connection: BoardConnection) -> None:
        self._boards.setdefault(board_id, set()).add(connection)

    def remove(self, board_id: uuid.UUID, connection: BoardConnection) -> None:
        connections = self._boards.get(board_id)
        if connections is None:
            return
        connections.discard(connection)
        if not connections:
            del self._boards[board_id]  # don't leak empty sets forever

    def count(self, board_id: uuid.UUID) -> int:
        return len(self._boards.get(board_id, ()))

    async def broadcast(
        self,
        board_id: uuid.UUID,
        message: dict,
        *,
        exclude_connection_id: str | None = None,
    ) -> None:
        """Send to every live connection on the board.

        A send to a half-dead socket raises; that connection is dropped here
        rather than allowed to poison every future broadcast.
        """
        dead: list[BoardConnection] = []
        for connection in list(self._boards.get(board_id, ())):
            if connection.connection_id == exclude_connection_id:
                continue
            try:
                await connection.websocket.send_json(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.remove(board_id, connection)

    async def broadcast_bytes(
        self,
        board_id: uuid.UUID,
        payload: bytes,
        *,
        exclude_connection_id: str | None = None,
    ) -> None:
        """Binary twin of broadcast — CRDT updates travel as binary frames."""
        dead: list[BoardConnection] = []
        for connection in list(self._boards.get(board_id, ())):
            if connection.connection_id == exclude_connection_id:
                continue
            try:
                await connection.websocket.send_bytes(payload)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.remove(board_id, connection)


manager = ConnectionManager()
