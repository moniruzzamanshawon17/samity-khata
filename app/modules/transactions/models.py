from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TransactionType(StrEnum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    REPAYMENT = "repayment"
    REVERSAL = "reversal"


class Transaction(Base):
    """One money movement. Rows are never updated or deleted; a mistake is
    corrected by a reversal row that points to the original."""

    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_paisa > 0", name="ck_transactions_amount_positive"),
        CheckConstraint(
            "type IN ('deposit', 'withdrawal', 'repayment', 'reversal')",
            name="ck_transactions_type",
        ),
        CheckConstraint(
            "(type = 'reversal') = (reverses_id IS NOT NULL)",
            name="ck_transactions_reversal_link",
        ),
        Index("ix_transactions_member_id_occurred_on", "member_id", "occurred_on"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="RESTRICT"))
    type: Mapped[str] = mapped_column(String(20))
    amount_paisa: Mapped[int] = mapped_column(BigInteger)
    occurred_on: Mapped[date] = mapped_column(Date)
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reverses_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="RESTRICT"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )