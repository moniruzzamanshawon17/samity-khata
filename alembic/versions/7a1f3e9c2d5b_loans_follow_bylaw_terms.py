"""loans: term_months for reducing-balance instalments (Clauses 4.6-4.8)

Revision ID: 7a1f3e9c2d5b
Revises: 6e3c1a9f4b7d
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '7a1f3e9c2d5b'
down_revision: Union[str, Sequence[str], None] = '6e3c1a9f4b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing loans (from before the bylaw rules) are given a 12-month term.
    op.add_column('loans', sa.Column('term_months', sa.Integer(), nullable=False, server_default='12'))
    op.alter_column('loans', 'term_months', server_default=None)
    op.create_check_constraint('ck_loans_term_months', 'loans', 'term_months IN (6, 12, 18, 24)')


def downgrade() -> None:
    op.drop_constraint('ck_loans_term_months', 'loans', type_='check')
    op.drop_column('loans', 'term_months')