"""create transactions

Revision ID: 4c9a2e7b5d1f
Revises: 3b8e1f6a2d4c
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4c9a2e7b5d1f"
down_revision: str | None = "3b8e1f6a2d4c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount_paisa", sa.BigInteger(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("recorded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reverses_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("reverses_id", name="transactions_reverses_id_key"),
        sa.CheckConstraint("amount_paisa > 0", name="ck_transactions_amount_positive"),
        sa.CheckConstraint(
            "type IN ('deposit', 'withdrawal', 'repayment', 'reversal')",
            name="ck_transactions_type",
        ),
        sa.CheckConstraint(
            "(type = 'reversal') = (reverses_id IS NOT NULL)",
            name="ck_transactions_reversal_link",
        ),
    )
    op.create_index(
        "ix_transactions_member_id_occurred_on", "transactions", ["member_id", "occurred_on"]
    )

    # Transactions are append-only: corrections are made with a reversal row.
    op.execute(
        """
        CREATE FUNCTION forbid_transaction_change() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'transactions are append-only; record a reversal instead';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER transactions_append_only
        BEFORE UPDATE OR DELETE ON transactions
        FOR EACH ROW EXECUTE FUNCTION forbid_transaction_change()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS transactions_append_only ON transactions")
    op.execute("DROP FUNCTION IF EXISTS forbid_transaction_change()")
    op.drop_index("ix_transactions_member_id_occurred_on", table_name="transactions")
    op.drop_table("transactions")