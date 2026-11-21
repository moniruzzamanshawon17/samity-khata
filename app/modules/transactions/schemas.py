from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.modules.transactions.models import TransactionType


class NewTransactionType(StrEnum):
    """Types that can be recorded directly. Reversals have their own endpoint."""

    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    REPAYMENT = "repayment"


def _not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("occurred_on cannot be in the future")
    return value


OccurredOn = Annotated[date, AfterValidator(_not_in_future)]


class TransactionCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "member_id": 1,
                "type": "deposit",
                "amount_paisa": 50000,
                "occurred_on": "2026-11-21",
            }
        }
    )

    member_id: int = Field(gt=0)
    type: NewTransactionType
    amount_paisa: int = Field(gt=0, description="Amount in paisa (1 taka = 100 paisa)")
    occurred_on: OccurredOn = Field(default_factory=date.today)


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    type: TransactionType
    amount_paisa: int
    occurred_on: date
    recorded_by: int
    reverses_id: int | None
    reversed_by_id: int | None = Field(
        default=None, description="Id of the reversal row, if this transaction was reversed"
    )
    created_at: datetime


class BalanceRead(BaseModel):
    member_id: int
    total_deposits_paisa: int = Field(description="Deposits, net of reversed deposits")
    total_withdrawals_paisa: int = Field(description="Withdrawals, net of reversed withdrawals")
    total_repayments_paisa: int = Field(description="Loan repayments, net of reversals")
    savings_balance_paisa: int = Field(description="Deposits minus withdrawals")