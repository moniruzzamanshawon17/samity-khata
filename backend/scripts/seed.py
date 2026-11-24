import asyncio
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.core.exceptions import ServiceUnavailableError
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.integrations.embeddings import get_embedding_client
from app.modules.auth.models import User, UserRole
from app.modules.auth.repositories import UserRepository
from app.modules.bylaws.repositories import BylawRepository
from app.modules.bylaws.services import BylawService
from app.modules.loans import bylaw_rules as rules
from app.modules.loans.calculations import Payment
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.schemas import LoanCreate
from app.modules.loans.services import LoanService, position_of
from app.modules.members.models import Member
from app.modules.members.repositories import MemberRepository
from app.modules.members.schemas import MemberCreate
from app.modules.members.services import MemberService
from app.modules.samities.repositories import SamityRepository
from app.modules.samities.schemas import SamityCreate
from app.modules.samities.services import SamityService
from app.modules.transactions.models import TransactionType
from app.modules.transactions.repositories import TransactionRepository
from app.modules.transactions.schemas import TransactionCreate
from app.modules.transactions.services import TransactionService

PASSWORD = "samity-demo-123"
SAMITY_NAME = "Shapla Sanchay O Rindan Samabay Samity Ltd"
BYLAWS = Path("data/bylaws")
TODAY = date.today()

USERS = [
    ("Nasrin Akter", "secretary@example.com", UserRole.ADMIN),
    ("Jamal Uddin", "collector@example.com", UserRole.STAFF),
    ("Rahima Begum", "rahima@example.com", UserRole.CUSTOMER),
    ("Karim Mia", "karim@example.com", UserRole.CUSTOMER),
    ("Salma Khatun", "salma@example.com", UserRole.CUSTOMER),
]


@dataclass(frozen=True)
class DemoMember:
    no: str
    name: str
    phone: str
    months_ago: int  # joined on the 1st of that month
    login: str | None = None  # linked customer account
    skip_last: int = 0  # unpaid recent deposits


MEMBERS = [
    DemoMember("SSR-0001", "Rahima Begum", "01712345601", 24, "rahima@example.com"),
    DemoMember("SSR-0002", "Karim Mia", "01812345602", 24, "karim@example.com"),
    DemoMember("SSR-0003", "Salma Khatun", "01912345603", 24, "salma@example.com"),
    DemoMember("SSR-0004", "Fatema Khanam", "01712345604", 24),
    DemoMember("SSR-0005", "Rokeya Sultana", "01612345605", 20),
    DemoMember("SSR-0006", "Hasina Parvin", "01512345606", 18),
    DemoMember("SSR-0007", "Morium Nesa", "01312345607", 15),
    DemoMember("SSR-0008", "Ayesha Siddika", "01412345608", 12, skip_last=4),
    DemoMember("SSR-0009", "Shirin Akter", "01712345609", 9, skip_last=1),
    DemoMember("SSR-0010", "Nurjahan Begum", "01812345610", 2),
]


def first_of_month(months_ago: int) -> date:
    return rules.add_months(date(TODAY.year, TODAY.month, 1), -months_ago)


def deposit_dates(joined_on: date) -> list[date]:
    """The 10th of every month since joining (Clause 3.1), up to today."""
    first = date(joined_on.year, joined_on.month, rules.DEPOSIT_DUE_DAY)
    if joined_on.day > rules.DEPOSIT_DUE_DAY:
        first = rules.add_months(first, 1)
    return [rules.add_months(first, i) for i in range(rules.deposits_due(joined_on, TODAY))]


class Seeder:
    def __init__(self, session) -> None:
        self.session = session
        users = UserRepository(session)
        members = MemberRepository(session)
        samities = SamityRepository(session)
        transactions = TransactionRepository(session)
        loans = LoanRepository(session)
        self.users = users
        self.samities = SamityService(samities)
        self.members = MemberService(members, samities, users)
        self.transactions = TransactionService(transactions, members, loans, samities)
        self.loans = LoanService(loans, members, samities, transactions)
        self.loan_repo = loans
        self.bylaws = BylawService(session, BylawRepository(session), samities, get_embedding_client())
        self.samity_repo = samities
        self.reused: list[str] = []

    async def user(self, name: str, email: str, role: UserRole) -> User:
        existing = await self.users.get_by_email(email)
        if existing is not None:
            self.reused.append(email)
            return existing
        return await self.users.create(
            User(name=name, email=email, password_hash=hash_password(PASSWORD), role=role)
        )

    async def record(self, by: User, member: Member, kind: TransactionType, paisa: int, on: date, loan_id: int | None = None):
        return await self.transactions.record(
            TransactionCreate(member_id=member.id, type=kind, amount_paisa=paisa, occurred_on=on, loan_id=loan_id),
            by,
        )

    async def loan(self, collector: User, member: Member, taka: int, term: int, months_ago: int, instalments_paid: int | None):
        """Disburse a loan and repay instalments on their due dates.
        instalments_paid=None pays every instalment due so far."""
        loan = await self.loans.create(
            LoanCreate(member_id=member.id, principal_paisa=taka * 100, term_months=term, start_on=first_of_month(months_ago))
        )
        model = await self.loan_repo.get(loan.id)
        payments: list[Payment] = []
        due_dates = [d for d in rules.instalment_due_dates(model.start_on, term) if d < TODAY]
        for due_on in due_dates[:instalments_paid]:
            owed = position_of(model, payments, as_of=due_on).outstanding_paisa
            amount = min(model.instalment_paisa, owed)
            if amount <= 0:
                break
            await self.record(collector, member, TransactionType.REPAYMENT, amount, due_on, loan.id)
            payments.append(Payment(due_on, amount))
        return loan


async def seed() -> None:
    async with SessionLocal() as session:
        s = Seeder(session)
        users = {email: await s.user(name, email, role) for name, email, role in USERS}
        if s.reused:
            print("Already existed, password unchanged: " + ", ".join(s.reused))
        admin, collector = users["secretary@example.com"], users["collector@example.com"]

        if await s.samity_repo.get_by_name(SAMITY_NAME) is not None:
            print(f"'{SAMITY_NAME}' already exists: nothing to do.")
            return

        samity = await s.samities.create(
            SamityCreate(name=SAMITY_NAME, union="Shantinagar", monthly_deposit_paisa=rules.MONTHLY_DEPOSIT_PAISA)
        )
        print(f"Samity #{samity.id} {samity.name}")

        members: dict[str, Member] = {}
        for m in MEMBERS:
            member = await s.members.create(
                MemberCreate(
                    samity_id=samity.id,
                    member_no=m.no,
                    name=m.name,
                    phone=m.phone,
                    user_id=users[m.login].id if m.login else None,
                    joined_on=first_of_month(m.months_ago),
                )
            )
            members[m.no] = member
            dates = deposit_dates(member.joined_on)
            for on in dates[: len(dates) - m.skip_last]:
                await s.record(collector, member, TransactionType.DEPOSIT, samity.monthly_deposit_paisa, on)
            print(f"  member #{member.id} {m.no} {m.name}: {len(dates) - m.skip_last} deposits")

        # A deposit typed in wrongly last month, then reversed by the secretary (Clause 3.4).
        wrong = await s.record(collector, members["SSR-0005"], TransactionType.DEPOSIT, 5_000_00, first_of_month(1))
        await s.transactions.reverse(wrong.id, admin)
        print("  reversed a mistaken Tk 5,000 deposit for SSR-0005")

        # A withdrawal of Tk 3,000 three months ago (Clause 3.5: at most 50% of savings).
        await s.record(admin, members["SSR-0004"], TransactionType.WITHDRAWAL, 3_000_00, first_of_month(3))
        print("  Tk 3,000 withdrawal for SSR-0004")

        on_time = await s.loan(collector, members["SSR-0001"], 30_000, 12, 5, None)
        overdue = await s.loan(collector, members["SSR-0002"], 20_000, 12, 7, 3)
        closed = await s.loan(collector, members["SSR-0003"], 12_000, 6, 12, None)
        await s.loans.refresh_statuses()
        for label, loan in (("on time", on_time), ("overdue", overdue), ("repaid", closed)):
            state = await s.loans.get(loan.id, admin)
            print(f"  loan #{loan.id} ({label}): Tk {loan.principal_paisa // 100:,}, status {state.status}")

        for name in ("bylaw_en.md", "bylaw_bn.md"):
            path = BYLAWS / name
            if not path.exists():
                print(f"  skipped {path}: file not found")
                continue
            try:
                result = await s.bylaws.ingest(
                    data=path.read_bytes(), filename=name, title=None, samity_id=samity.id, uploaded_by=admin.id
                )
                print(f"  bylaw #{result.id} {result.title}: {result.chunk_count} chunks")
            except ServiceUnavailableError:
                print(f"  skipped {name}: embedding service is not up (run scripts.ingest_bylaws later)")


def main() -> None:
    async def run() -> None:
        try:
            await seed()
        finally:
            await engine.dispose()

    asyncio.run(run())
    print(f"\nLogins (password for all: {PASSWORD})")
    for _, email, role in USERS:
        print(f"  {role.value:<9} {email}")


if __name__ == "__main__":
    main()