from datetime import date
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimeSpent


class MemberStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class Member(TimeSpent, Base):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("samity_id", "member_no", name="uq_members_samity_member_no"),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_members_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    samity_id: Mapped[int] = mapped_column(ForeignKey("samities.id", ondelete="RESTRICT"))
    member_no: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20))
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    joined_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(10), server_default=MemberStatus.ACTIVE.value
    )