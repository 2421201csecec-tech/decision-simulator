"""outcome_rating column on decisions

Revision ID: b2c4e8f91a03
Revises: f3e91d047a28
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c4e8f91a03"
down_revision: Union[str, None] = "f3e91d047a28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("decisions", sa.Column("outcome_rating", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("decisions", "outcome_rating")
