from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.core.schemas import PatchModel
from app.modules.members.models import MemberStatus


def _not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("joined_on cannot be in the future")
    return value


MemberNo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
MemberName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?\d{10,15}$")]
JoinedOn = Annotated[date, AfterValidator(_not_in_future)]


class MemberCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "samity_id": 1,
                "member_no": "M-001",
                "name": "Rahima Begum",
                "phone": "01712345678",
                "user_id": None,
                "joined_on": "2026-01-15",
                "status": "active",
            }
        }
    )

    samity_id: int = Field(gt=0)
    member_no: MemberNo
    name: MemberName
    phone: Phone
    user_id: int | None = Field(default=None, gt=0)
    joined_on: JoinedOn = Field(default_factory=date.today)
    status: MemberStatus = MemberStatus.ACTIVE


class MemberUpdate(PatchModel):
    nullable_fields = frozenset({"user_id"})

    member_no: MemberNo | None = None
    name: MemberName | None = None
    phone: Phone | None = None
    user_id: int | None = Field(default=None, gt=0)
    joined_on: JoinedOn | None = None
    status: MemberStatus | None = None


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    samity_id: int
    member_no: str
    name: str
    phone: str
    user_id: int | None
    joined_on: date
    status: MemberStatus
    created_at: datetime
    updated_at: datetime