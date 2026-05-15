"""pattern_instances table

Revision ID: c1f9e2a83b45
Revises: 8d0a68d59910
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1f9e2a83b45"
down_revision: Union[str, None] = "8d0a68d59910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pattern_instances",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("decision_id", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("field_type", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("raw_text", sa.String(500), nullable=False),
        sa.Column("raw_text_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.decision_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "decision_id", "slug", "raw_text_hash", name="uq_pattern_instance"),
    )
    op.create_index("ix_pattern_instances_user_id", "pattern_instances", ["user_id"])
    op.create_index("ix_pi_user_slug_created", "pattern_instances", ["user_id", "slug", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_pi_user_slug_created", table_name="pattern_instances")
    op.drop_index("ix_pattern_instances_user_id", table_name="pattern_instances")
    op.drop_table("pattern_instances")
