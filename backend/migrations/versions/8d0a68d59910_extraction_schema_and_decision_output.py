"""add extraction_schema and decision_output to decisions

Revision ID: 8d0a68d59910
Revises: a3f82c910d14
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8d0a68d59910"
down_revision: Union[str, None] = "a3f82c910d14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("decisions", sa.Column("extraction_schema", sa.JSON(), nullable=True))
    op.add_column("decisions", sa.Column("decision_output", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("decisions", "decision_output")
    op.drop_column("decisions", "extraction_schema")
