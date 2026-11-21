from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.schemas import PatchModel

SamityName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
UnionName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Paisa = Annotated[int, Field(gt=0, description="Amount in paisa (1 taka = 100 paisa)")]


class SamityCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Shapla Mohila Samity",
                "union": "Kashimpur",
                "monthly_deposit_paisa": 50000,
                "bylaw_document_id": None,
            }
        }
    )

    name: SamityName
    union: UnionName
    monthly_deposit_paisa: Paisa
    bylaw_document_id: int | None = None


class SamityUpdate(PatchModel):
    nullable_fields = frozenset({"bylaw_document_id"})

    name: SamityName | None = None
    union: UnionName | None = None
    monthly_deposit_paisa: Paisa | None = None
    bylaw_document_id: int | None = None


class SamityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    union: str
    monthly_deposit_paisa: int
    bylaw_document_id: int | None
    created_at: datetime
    updated_at: datetime