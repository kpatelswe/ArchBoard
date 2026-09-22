# Backend image: FastAPI + uvicorn under uv. Deployable to any container
# host (Render, Railway, Fly, a VPS) identically.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Dependencies first, in their own layer: code edits don't re-download them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

# $PORT is set by the platform (Render/Railway); 8000 locally.
#
# WebSocket intake caps: uvicorn defaults to 16MB frames x a 32-message
# inbound queue per socket (512MB a client can make us hold before any
# backpressure). The handler's own size check runs only after a frame is
# fully in memory, so the real limit has to live here, where the library
# rejects oversized frames (close 1009) before allocating them. 1MB, not
# the handler's 64KB: on every (re)connect the client pushes its whole CRDT
# document in one frame, and that grows with edit history (a 3-node board
# is already ~10KB), so a tight cap here would reconnect-loop a big board.
# Worst case is now 8MB per socket. The queue is shallow because every
# frame costs Redis round-trips, so a deep queue only buys memory use.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --ws-max-size 1048576 --ws-max-queue 8"]
