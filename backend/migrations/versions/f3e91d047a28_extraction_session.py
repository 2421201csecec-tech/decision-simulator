"""extraction_session column on decisions

Revision ID: f3e91d047a28
Revises: c1f9e2a83b45
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3e91d047a28"
down_revision: Union[str, None] = "c1f9e2a83b45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("decisions", sa.Column("extraction_session", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("decisions", "extraction_session")
