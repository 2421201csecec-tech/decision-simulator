"""initial schema

Revision ID: 14df1a5d3682
Revises:
Create Date: 2026-04-25 22:04:01.930574

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '14df1a5d3682'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "decisions",
        sa.Column("decision_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("decision_category", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("parent_decision_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clarify_draft", sa.JSON(), nullable=False),
        sa.Column("pressure_test", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["parent_decision_id"], ["decisions.decision_id"]),
        sa.PrimaryKeyConstraint("decision_id"),
    )
    op.create_index("ix_decisions_user_id", "decisions", ["user_id"])
    op.create_index("ix_decisions_decision_category", "decisions", ["decision_category"])
    op.create_index("ix_decisions_created_at", "decisions", ["created_at"])

    op.create_table(
        "failure_analyses",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("decision_id", sa.String(), nullable=False),
        sa.Column("what_happened", sa.Text(), nullable=False),
        sa.Column("observations", sa.JSON(), nullable=False),
        sa.Column("failed_assumptions", sa.JSON(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=False),
        sa.Column("likely_root_cause", sa.Text(), nullable=False),
        sa.Column("cognitive_bias", sa.Text(), nullable=False),
        sa.Column("missed_variable", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["decision_id"], ["decisions.decision_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("decision_id"),
    )

    op.create_table(
        "pattern_profiles",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("patterns", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("decision_id", sa.String(), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["decision_id"], ["decisions.decision_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_simulation_runs_decision_id", "simulation_runs", ["decision_id"])


def downgrade() -> None:
    op.drop_index("ix_simulation_runs_decision_id", table_name="simulation_runs")
    op.drop_table("simulation_runs")
    op.drop_table("pattern_profiles")
    op.drop_table("failure_analyses")
    op.drop_index("ix_decisions_created_at", table_name="decisions")
    op.drop_index("ix_decisions_decision_category", table_name="decisions")
    op.drop_index("ix_decisions_user_id", table_name="decisions")
    op.drop_table("decisions")
