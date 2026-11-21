from typing import ClassVar, Generic, TypeVar

from pydantic import BaseModel, model_validator

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class PatchModel(BaseModel):
    """Base for PATCH bodies: omitted fields stay unchanged, and an explicit
    null is only accepted for fields listed in `nullable_fields`."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def reject_nulls(self):
        for field in self.model_fields_set:
            if getattr(self, field) is None and field not in self.nullable_fields:
                raise ValueError(f"{field} cannot be null")
        return self