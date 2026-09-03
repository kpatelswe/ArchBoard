import websockets.http11
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import boards, health, invites, users
from app.websocket import routes as websocket_routes
from app.core.config import get_settings

# Dev-only: the websockets library caps each WS-handshake header line at 8KB.
# On localhost, browsers send the whole cookie jar with the upgrade (cookies
# ignore ports, and unlike our cross-origin fetches a WebSocket always sends
# them), which overflows that cap and 431s the handshake — live sync then
# silently never connects. In production cookies are scoped to our domain and
# stay small, and the strict cap is wanted (oversized headers are cheap DoS
# surface), so the raise applies only outside production.
if get_settings().app_env != "production":
    websockets.http11.MAX_LINE_LENGTH = max(
        websockets.http11.MAX_LINE_LENGTH, 131_072
    )


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ArchBoard API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(users.router)
    app.include_router(boards.router)
    app.include_router(invites.router)
    app.include_router(websocket_routes.router)
    return app


app = create_app()
