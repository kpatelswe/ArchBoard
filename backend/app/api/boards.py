import uuid

from fastapi import APIRouter, HTTPException, status

from pydantic import BaseModel, Field

from app.analysis.graph import BoardGraph
from app.analysis.rules import Finding, run_rules
from app.api.deps import CurrentUser, DbSession
from app.realtime.state import registry
from app.schemas.snapshot import BoardSnapshot
from app.core.exceptions import (
    AccessDenied,
    InsufficientRole,
    NotFound,
    VersionConflict,
)
from app.models.board import Board
from app.models.membership import BoardRole
from app.schemas.board import (
    BoardConflict,
    BoardCreate,
    BoardRead,
    BoardSnapshotUpdate,
    BoardSummary,
    InviteCreate,
    InviteCreated,
    InviteRead,
)
from app.services import board_service, invite_service

router = APIRouter(prefix="/api/boards", tags=["boards"])


def _with_role(board: Board, role: BoardRole | None) -> BoardRead:
    return BoardRead.model_validate(board).model_copy(update={"role": role})


def _not_found() -> HTTPException:
    # Non-members and nonexistent boards look identical on purpose.
    return HTTPException(status.HTTP_404_NOT_FOUND, "board not found")


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
async def create_board(payload: BoardCreate, user: CurrentUser, session: DbSession):
    board = await board_service.create_board(session, user=user, name=payload.name)
    return _with_role(board, BoardRole.OWNER)


@router.get("", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser, session: DbSession):
    return [
        BoardSummary.model_validate(board).model_copy(update={"role": role})
        for board, role in await board_service.list_boards(session, user=user)
    ]


class AnalysisResult(BaseModel):
    findings: list[Finding] = Field(default_factory=list)


@router.get("/{board_id}/analysis", response_model=AnalysisResult)
async def analyze_board(
    board_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
):
    """Run the structural design linter.

    Analyzes the LIVE board when a realtime session holds it — a linter that
    lags behind the drawing is a linter nobody trusts — and falls back to the
    persisted snapshot when nobody is connected. Read-only and stateless.
    """
    try:
        board, _role = await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()

    live = registry.peek(board_id)
    raw = live.to_snapshot() if live is not None else board.current_snapshot
    try:
        snapshot = BoardSnapshot.model_validate(raw)
    except ValueError:
        # Post-merge validation is the CRDT tradeoff: a peer can put junk in
        # the doc. Refusing to analyze beats crashing.
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "board state is not analyzable"
        )
    graph = BoardGraph.from_snapshot(snapshot)
    return AnalysisResult(findings=run_rules(graph))


@router.get("/{board_id}", response_model=BoardRead)
async def get_board(board_id: uuid.UUID, user: CurrentUser, session: DbSession):
    try:
        board, role = await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
        return _with_role(board, role)
    except (NotFound, AccessDenied):
        raise _not_found()


@router.put(
    "/{board_id}/snapshot",
    response_model=BoardRead,
    responses={409: {"model": BoardConflict}},
)
async def save_snapshot(
    board_id: uuid.UUID,
    payload: BoardSnapshotUpdate,
    user: CurrentUser,
    session: DbSession,
):
    try:
        board = await board_service.save_snapshot(
            session,
            user=user,
            board_id=board_id,
            snapshot=payload.snapshot,
            expected_version=payload.version,
        )
        return BoardRead.model_validate(board)
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "viewers cannot edit")
    except VersionConflict:
        board, _ = await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "detail": "board was modified by someone else",
                "current_version": board.version,
            },
        )


@router.post(
    "/{board_id}/invites",
    response_model=InviteCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    board_id: uuid.UUID,
    payload: InviteCreate,
    user: CurrentUser,
    session: DbSession,
):
    try:
        invite, token = await invite_service.create_invite(
            session,
            user=user,
            board_id=board_id,
            role=payload.role,
            expires_in_hours=payload.expires_in_hours,
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))
    return InviteCreated(**InviteRead.model_validate(invite).model_dump(), token=token)


@router.get("/{board_id}/invites", response_model=list[InviteRead])
async def list_invites(board_id: uuid.UUID, user: CurrentUser, session: DbSession):
    try:
        return await invite_service.list_invites(
            session, user=user, board_id=board_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")


@router.delete(
    "/{board_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_invite(
    board_id: uuid.UUID,
    invite_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
):
    try:
        await invite_service.revoke_invite(
            session, user=user, board_id=board_id, invite_id=invite_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")
