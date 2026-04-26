"""extraction_memory table

Revision ID: a3f82c910d14
Revises: 14df1a5d3682
Create Date: 2026-04-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f82c910d14"
down_revision: Union[str, None] = "14df1a5d3682"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_memory",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("decision_category", sa.String(), nullable=True),
        sa.Column("overall_confidence", sa.Float(), nullable=False),
        sa.Column("schema_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_extraction_memory_decision_category", "extraction_memory", ["decision_category"])
    op.create_index("ix_extraction_memory_created_at", "extraction_memory", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_extraction_memory_created_at", table_name="extraction_memory")
    op.drop_index("ix_extraction_memory_decision_category", table_name="extraction_memory")
    op.drop_table("extraction_memory")
