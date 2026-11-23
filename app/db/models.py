"""Imports every model so SQLAlchemy knows all tables and their foreign keys,
whichever entry point (API, script or test) opens a database session."""

from app.modules.auth.models import User  # noqa: F401
from app.modules.bylaws.models import BylawChunk, BylawDocument  # noqa: F401
from app.modules.loans.models import Loan  # noqa: F401
from app.modules.members.models import Member  # noqa: F401
from app.modules.samities.models import Samity  # noqa: F401
from app.modules.transactions.models import Transaction  # noqa: F401