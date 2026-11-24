"""users: replace phone with email, roles admin/staff/customer

Revision ID: 2a7d9e4b1c3f
Revises: 1c79fb3ed6f4
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2a7d9e4b1c3f"
down_revision: str | None = "1c79fb3ed6f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Phone moves to the members table; dropping the column also drops its
    # unique constraint.
    op.drop_column("users", "phone")
    op.add_column("users", sa.Column("email", sa.String(255), nullable=False))
    op.create_unique_constraint("users_email_key", "users", ["email"])

    op.execute("UPDATE users SET role = 'customer' WHERE role = 'member'")
    op.alter_column("users", "role", server_default="customer")
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('admin', 'staff', 'customer')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.alter_column("users", "role", server_default="member")
    op.execute("UPDATE users SET role = 'member' WHERE role = 'customer'")

    op.drop_constraint("users_email_key", "users", type_="unique")
    op.drop_column("users", "email")
    op.add_column("users", sa.Column("phone", sa.String(20), nullable=False))
    op.create_unique_constraint("users_phone_key", "users", ["phone"])