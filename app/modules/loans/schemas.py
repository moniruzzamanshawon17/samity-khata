from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.modules.loans.models import LoanStatus


def _not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("start_on cannot be in the future")
    return value


class LoanCreate(BaseModel):
    """Rate and instalment come from the bylaw (Clauses 4.6-4.7), not the request."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "member_id": 1,
                "principal_paisa": 2000000,
                "term_months": 12,
                "start_on": "2026-11-22",
            }
        }
    )

    member_id: int = Field(gt=0)
    principal_paisa: int = Field(gt=0, description="Amount lent, in paisa")
    term_months: Literal[6, 12, 18, 24] = Field(description="Clause 4.8")
    start_on: Annotated[date, AfterValidator(_not_in_future)] = Field(
        default_factory=date.today, description="Disbursement date"
    )


class LoanRead(BaseModel):
    id: int
    member_id: int
    principal_paisa: int
    annual_rate_bp: int
    term_months: int
    instalment_paisa: int = Field(description="Monthly instalment (Clause 4.7)")
    start_on: date
    status: LoanStatus
    closed_on: date | None
    created_at: datetime
    updated_at: datetime

    principal_outstanding_paisa: int
    interest_charged_paisa: int = Field(description="Interest charged on due dates so far")
    interest_due_paisa: int = Field(description="Interest charged but not yet paid")
    repaid_paisa: int = Field(description="Repayments, excluding reversed ones")
    outstanding_paisa: int = Field(description="Amount that would close the loan today")
    due_now_paisa: int = Field(description="Instalments due by today and not yet paid")
    next_due_on: date | None


class ScheduleRow(BaseModel):
    month: int
    due_on: date
    payment_paisa: int
    interest_paisa: int
    principal_paisa: int
    balance_after_paisa: int


class LoanSchedule(BaseModel):
    loan_id: int
    instalment_paisa: int
    total_interest_paisa: int
    rows: list[ScheduleRow]