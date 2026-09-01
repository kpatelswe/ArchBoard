"""Short-lived signed tickets that carry authentication to the WebSocket.

The browser's WebSocket constructor cannot set an Authorization header, so the
client first POSTs to a normal authenticated endpoint to mint a ticket, then
opens the socket with the ticket in the query string. The ticket is HMAC-signed
and self-contained, so verification needs no storage and works identically
across multiple backend processes.

A 30s TTL bounds the query-string exposure: even if a ticket lands in a log,
it is dead within half a minute and only ever grants a socket handshake.
"""

import base64
import hashlib
import hmac
import json
import time
import uuid

from app.core.config import get_settings

TICKET_TTL_SECONDS = 30

# Derive a purpose-specific key so the Clerk secret itself is never used
# directly as an HMAC key (key separation).
_KEY = hashlib.sha256(
    (get_settings().clerk_secret_key + ":ws-ticket-v1").encode()
).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def mint_ticket(*, user_id: uuid.UUID, board_id: uuid.UUID) -> str:
    payload = _b64(
        json.dumps(
            {
                "u": str(user_id),
                "b": str(board_id),
                "e": int(time.time()) + TICKET_TTL_SECONDS,
            }
        ).encode()
    )
    signature = _b64(hmac.new(_KEY, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_ticket(ticket: str, *, board_id: uuid.UUID) -> uuid.UUID | None:
    """Returns the user id, or None for anything invalid.

    Signature is checked before the payload is even parsed, and compared with
    compare_digest so timing does not leak how many bytes matched.
    """
    try:
        payload, signature = ticket.split(".", 1)
        expected = _b64(hmac.new(_KEY, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(_unb64(payload))
        if claims["e"] < time.time():
            return None
        if claims["b"] != str(board_id):
            return None
        return uuid.UUID(claims["u"])
    except (ValueError, KeyError, TypeError):
        return None
