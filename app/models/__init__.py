# Import every model here so Base.metadata knows about all tables
# (Alembic autogenerate relies on this).
from app.models.user import User

__all__ = ["User"]
