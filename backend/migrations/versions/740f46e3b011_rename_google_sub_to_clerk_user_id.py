"""rename google_sub to clerk_user_id

Revision ID: 740f46e3b011
Revises: fd507c7c2ca1
Create Date: 2026-08-30 21:52:10.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '740f46e3b011'
down_revision: Union[str, Sequence[str], None] = 'fd507c7c2ca1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename rather than drop/create, so existing rows survive."""
    op.alter_column('users', 'google_sub', new_column_name='clerk_user_id')
    op.execute('ALTER INDEX ix_users_google_sub RENAME TO ix_users_clerk_user_id')


def downgrade() -> None:
    op.execute('ALTER INDEX ix_users_clerk_user_id RENAME TO ix_users_google_sub')
    op.alter_column('users', 'clerk_user_id', new_column_name='google_sub')
