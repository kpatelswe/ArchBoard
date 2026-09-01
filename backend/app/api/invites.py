from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound
from app.schemas.board import BoardRead, InviteAccept
from app.services import invite_service

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.post("/accept", response_model=BoardRead)
async def accept_invite(payload: InviteAccept, user: CurrentUser, session: DbSession):
    try:
        board = await invite_service.accept_invite(
            session, user=user, token=payload.token
        )
    except NotFound:
        # Unknown, expired and revoked all collapse into one answer.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invite not found")
    return BoardRead.model_validate(board)
