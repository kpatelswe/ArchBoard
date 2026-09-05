<p align="center"><img src="docs/banner.svg" alt="ArchBoard, the whiteboard for system design" width="720"/></p>

Sketch system architectures with your team in real time, and let the board
tell you where they break.

**Live at [archboard.kishanpatel.ca](https://archboard.kishanpatel.ca)**

<!-- TODO: drop a screenshot/GIF here: board with cursors + a red SPOF finding -->
<!-- <p align="center"><img src="docs/screenshot.png" width="720"/></p> -->

## Features

- **Live collaboration.** Every edit merges in real time (Yjs CRDTs, no
  locks), with presence avatars, live cursors, and a "✎ Maya is editing"
  highlight. Offline edits reconcile on reconnect.
- **A built-in design linter.** A second after you stop drawing, seven
  structural rules re-check the board: single points of failure, sync call
  cycles, deep request chains, queues with no dead-letter path, clients
  wired straight into databases. Click a finding and the guilty nodes light
  up. Every finding says *why*, *the fix*, and *when it's actually fine*.
- **Share like a doc.** Google sign-in, invite links, editor/viewer roles.
- **Speaks the vocabulary.** 13 component types plus notes and shapes; tag
  components with their tech (`DATABASE · POSTGRES`, `QUEUE · KAFKA`).

## Architecture

```
Browser ──WebSocket──▶ FastAPI ──┬─▶ PostgreSQL (boards, users, invites, CRDT history)
   │  Yjs replica                ├─▶ Redis (pub/sub fan-out, presence TTLs, rate limits)
   └──binary CRDT updates────────┴─▶ pycrdt (server replica of each live board)
```

- Board state is a Yjs document replicated on every client and the server.
  Edits are binary merge updates over an authenticated WebSocket, fanned out
  across backend processes via Redis pub/sub (no sticky sessions).
- Postgres stores the materialized snapshot and encoded CRDT history with
  compare-and-swap versioning. Redis holds only ephemeral state.
- The linter runs pure graph rules (BFS reachability, memoized DFS with
  cycle detection) against the live document, debounced behind edits.

**Stack:** React · React Flow · TypeScript · FastAPI · SQLAlchemy · Yjs /
pycrdt · PostgreSQL (Neon) · Redis · Clerk

## Deployment

The frontend ships as static assets on **Vercel** behind a custom domain.
The backend is a **Docker** image on **Railway** — it holds WebSockets,
in-memory CRDT replicas, and a Redis subscription, so it runs as a
long-lived process rather than serverless — with **Redis** alongside it,
**PostgreSQL** on Neon, and **Clerk** serving production auth first-party
from the app's own domain. Pushing to `main` deploys both halves.
Multiple backend instances converge through Redis pub/sub, so the service
scales horizontally with no sticky sessions.

## Local development

```bash
cp .env.example .env && cp frontend/.env.example frontend/.env   # Neon + Clerk keys
docker run -d --name archboard-redis -p 6379:6379 redis:7
cd backend && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

Open the same board in two browser profiles to see the realtime layer work.
