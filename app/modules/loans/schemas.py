from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.modules.loans.models import LoanStatus


def _not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("start_on cannot be in the future")
    return value


class LoanCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "member_id": 1,
                "principal_paisa": 1200000,
                "annual_rate_bp": 1200,
                "instalment_paisa": 110000,
                "start_on": "2026-11-21",
            }
        }
    )

    member_id: int = Field(gt=0)
    principal_paisa: int = Field(gt=0, description="Amount lent, in paisa")
    annual_rate_bp: int = Field(
        ge=0, le=10_000, description="Flat yearly interest in basis points: 1200 = 12%"
    )
    instalment_paisa: int = Field(gt=0, description="Expected repayment each month, in paisa")
    start_on: Annotated[date, AfterValidator(_not_in_future)] = Field(default_factory=date.today)

    @model_validator(mode="after")
    def instalment_not_above_principal(self):
        if self.instalment_paisa > self.principal_paisa:
            raise ValueError("instalment_paisa cannot be more than principal_paisa")
        return self


class LoanRead(BaseModel):
    id: int
    member_id: int
    principal_paisa: int
    annual_rate_bp: int
    instalment_paisa: int
    start_on: date
    status: LoanStatus
    closed_on: date | None
    created_at: datetime
    updated_at: datetime

    months_elapsed: int = Field(description="Full months since start_on (or until closed_on)")
    interest_paisa: int = Field(description="Flat interest accrued so far")
    total_payable_paisa: int = Field(description="Principal plus interest so far")
    repaid_paisa: int = Field(description="Repayments, net of reversals")
    outstanding_paisa: int = Field(description="Still owed")
    due_so_far_paisa: int = Field(description="Instalments that should have been paid by now")