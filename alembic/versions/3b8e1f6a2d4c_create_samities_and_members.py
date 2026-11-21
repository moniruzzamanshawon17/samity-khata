"""create samities and members

Revision ID: 3b8e1f6a2d4c
Revises: 2a7d9e4b1c3f
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3b8e1f6a2d4c"
down_revision: str | None = "2a7d9e4b1c3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "samities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("union", sa.String(100), nullable=False),
        sa.Column("monthly_deposit_paisa", sa.BigInteger(), nullable=False),
        sa.Column("bylaw_document_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("name", name="samities_name_key"),
        sa.CheckConstraint("monthly_deposit_paisa > 0", name="ck_samities_monthly_deposit_positive"),
    )

    op.create_table(
        "members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("samity_id", sa.Integer(), sa.ForeignKey("samities.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("member_no", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("joined_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
        *_timestamps(),
        sa.UniqueConstraint("samity_id", "member_no", name="uq_members_samity_member_no"),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_members_status"),
    )
    op.create_index("ix_members_user_id", "members", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_members_user_id", table_name="members")
    op.drop_table("members")
    op.drop_table("samities")