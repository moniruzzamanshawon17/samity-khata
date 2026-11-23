from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

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
                "loan_id": None,
            }
        }
    )

    member_id: int = Field(gt=0)
    type: NewTransactionType
    amount_paisa: int = Field(gt=0, description="Amount in paisa (1 taka = 100 paisa)")
    occurred_on: OccurredOn = Field(default_factory=date.today)
    loan_id: int | None = Field(
        default=None, gt=0, description="Required for a repayment; must be empty otherwise"
    )

    @model_validator(mode="after")
    def loan_id_matches_type(self):
        if self.type == NewTransactionType.REPAYMENT and self.loan_id is None:
            raise ValueError("loan_id is required for a repayment")
        if self.type != NewTransactionType.REPAYMENT and self.loan_id is not None:
            raise ValueError("loan_id is only allowed for a repayment")
        return self


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int
    type: TransactionType
    amount_paisa: int
    occurred_on: date
    recorded_by: int
    loan_id: int | None
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
    savings_balance_paisa: int = Field(description="Deposits minus withdrawals (Clause 3.3)")
    monthly_deposit_paisa: int = Field(description="The samity's monthly deposit (Clause 3.1)")
    unpaid_deposits: int = Field(description="Monthly deposits due but not covered (Clause 3.1)")
    bylaw_status: str = Field(description="'inactive' at 3 or more unpaid deposits (Clause 2.4)")
    max_withdrawal_paisa: int = Field(description="Most that can be withdrawn now (Clause 3.5)")
    loan_ceiling_paisa: int = Field(description="Largest loan allowed by savings (Clause 4.2)")