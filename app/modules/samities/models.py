from sqlalchemy import BigInteger, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimeSpent


class Samity(TimeSpent, Base):
    __tablename__ = "samities"
    __table_args__ = (
        CheckConstraint(
            "monthly_deposit_paisa > 0", name="ck_samities_monthly_deposit_positive"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    union: Mapped[str] = mapped_column(String(100))
    monthly_deposit_paisa: Mapped[int] = mapped_column(BigInteger)
    bylaw_document_id: Mapped[int | None] = mapped_column(Integer)