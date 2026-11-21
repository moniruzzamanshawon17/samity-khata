from datetime import date
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimeSpent


class LoanStatus(StrEnum):
    ACTIVE = "active"
    CLOSED = "closed"
    OVERDUE = "overdue"


OPEN_STATUSES = (LoanStatus.ACTIVE, LoanStatus.OVERDUE)


class Loan(TimeSpent, Base):
    __tablename__ = "loans"
    __table_args__ = (
        CheckConstraint("principal_paisa > 0", name="ck_loans_principal_positive"),
        CheckConstraint("annual_rate_bp >= 0", name="ck_loans_rate_not_negative"),
        CheckConstraint("instalment_paisa > 0", name="ck_loans_instalment_positive"),
        CheckConstraint("status IN ('active', 'closed', 'overdue')", name="ck_loans_status"),
        CheckConstraint(
            "(status = 'closed') = (closed_on IS NOT NULL)", name="ck_loans_closed_on"
        ),
        Index("ix_loans_status", "status"),
        # A member can have at most one open (active or overdue) loan.
        Index(
            "uq_loans_one_open_per_member",
            "member_id",
            unique=True,
            postgresql_where=text("status IN ('active', 'overdue')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="RESTRICT"), index=True
    )
    principal_paisa: Mapped[int] = mapped_column(BigInteger)
    annual_rate_bp: Mapped[int] = mapped_column(Integer)
    instalment_paisa: Mapped[int] = mapped_column(BigInteger)
    start_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), server_default=LoanStatus.ACTIVE.value)
    closed_on: Mapped[date | None] = mapped_column(Date)