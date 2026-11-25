# Samity Khata · সমিতি খাতা

**The digital khata for savings and credit samitis in Bangladesh.**

Samity Khata replaces the paper ledger of a savings and credit *samity* (cooperative). It keeps the
member register, monthly deposits, withdrawals, loans and repayments; applies the samity's own
**bylaw** automatically; and lets the secretary, collectors and members ask questions about
balances and rules in **Bangla or English**, through a chat assistant and an MCP server.

| **Resource** | **Link** |
|---|---|
| **Live API (Swagger)** | [API Documentation](https://samity-khata.onrender.com/docs) |
| **Live Website** | [Samity Khata](https://samity-khata-app.onrender.com) |
| **Video Walkthrough** | [YOUR GOOGLE DRIVE LINK] |
| **Source Code** | [GitHub Repository](https://github.com/moniruzzamanshawon17/samity-khata) |

---

## Contents

- [Who it is for](#who-it-is-for)
- [Features](#features)
- [Business model](#business-model)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Demo data and logins](#demo-data-and-logins)
- [Configuration](#configuration)
- [API reference with examples](#api-reference-with-examples)
- [Chat assistant](#chat-assistant)
- [MCP server](#mcp-server)
- [Frontend](#frontend)
- [Tests](#tests)
- [Deployment](#deployment)
- [Design decisions](#design-decisions)
- [Known limitations](#known-limitations)
- [Project layout](#project-layout)
- [Bylaws and business rules](#bylaws-and-business-rules)

---

## Who it is for

**Primary savings and credit samitis in Bangladesh**: village and union-level cooperatives of
roughly 20 to 500 members, and NGO branch offices that run several such groups.

| Role | Person | Daily use |
|---|---|---|
| **Admin** | Samity secretary | Members, loans, withdrawals, corrections, bylaw, settings |
| **Staff** | Collector (*আদায়কারী*) | Records deposits and instalments on the 10th, on a phone |
| **Customer** | Member (*সদস্য*) | Sees own savings, loan schedule and history; asks questions in Bangla |

### The problem

Most samitis still run on a paper khata, an Excel sheet or a Facebook group:

- **Mistakes and disputes.** Pages get lost or overwritten, and one disputed entry can split a samity.
- **Hours of hand calculation.** The secretary adds totals and works out reducing-balance interest by hand every month.
- **Members can't check anything.** Balances are shared in chats or phone calls, not records anyone can trust.
- **Rules are applied inconsistently.** Loan limits, eligibility and late rules live in a bylaw few people read.

Samity Khata keeps one append-only record that everyone can trust, calculates every loan by the
bylaw, and lets each member see their own account.

## Features

- **Append-only ledger.** Deposits, withdrawals and repayments can't be edited or deleted. A
  mistake is corrected with a visible reversal (enforced in the API and by a database trigger).
- **Bylaw-enforced money rules.** Withdrawal limits, loan eligibility, loan ceiling, 12%
  reducing-balance interest, EMI, due dates and overdue status come from the bylaw, and every
  refusal names the clause.
- **Roles and privacy.** Admin, staff and customer, read from the database on every request. A
  member can only ever see their own records.
- **Bilingual RAG assistant.** Gemini with seven read-only, database-backed tools. Rule questions
  are answered from the samity's bylaw (English and Bangla, pgvector) with clause citations, or
  "the bylaws do not cover this".
- **MCP server.** The same tools plus resources and prompts, over streamable HTTP (`/mcp`) and stdio.
- **Web app.** A responsive React frontend for secretaries and collectors, and a mobile-first
  member app, in English and Bangla (including Bangla digits, dates and taka).

## Business model

A monthly **subscription per samity**, priced by member count:

| Plan | Price | Members | Collectors | Assistant questions |
|---|---|---|---|---|
| Khata | ৳500 / month | up to 50 | Secretary + 1 | 100 / month |
| **Samity** (most popular) | ৳1,200 / month | up to 200 | Secretary + 3 | 1,000 / month |
| Branch | ৳2,500 / month | up to 500 | Unlimited | 3,000 / month |

- **Setup fee ৳5,000, one time.** We import the paper khata or Excel register, load the bylaw and
  train the secretary and collectors. Free on an annual plan.
- **Annual plan:** pay for 10 months, get 12. **30-day free trial** on every plan.
- **Founding samities:** the first 10 samities get 3 months free in exchange for feedback.

**Why a samity would pay.** The basic plan costs less than one member's monthly deposit. It saves
the secretary hours of manual calculation each month, and one avoided dispute over a loan is worth
more than a year of the subscription. There is no affordable tool built around Bangladeshi samity
bylaws and the Bangla language.

The full pricing page is at `/pricing` in the web app.

## Tech stack

| Layer | Technology |
|---|---|
| API | FastAPI, Pydantic v2, SQLAlchemy 2 (async), asyncpg |
| Database | PostgreSQL 17 with pgvector, Alembic migrations |
| Auth | JWT (PyJWT), argon2 password hashing (pwdlib) |
| Embeddings | Hugging Face text-embeddings-inference, `intfloat/multilingual-e5-small` (384 dimensions) |
| LLM | Google Gemini via `google-genai`, with manual function calling |
| MCP | MCP Python SDK (streamable HTTP and stdio) |
| Frontend | React 18, TypeScript, Vite, React Router |
| Tooling | uv, Docker Compose, pytest |

## Architecture

```
                 ┌──────────────────────────── frontend/ (React + Vite) ────────────────────────────┐
  Browser  ─────▶│  staff web app · member app · landing · pricing   (EN / বাং, phone → desktop)       │
                 └───────────────────────────────┬──────────────────────────────────────────────────┘
                                                 │  /api/v1  (JWT bearer)
                                                 ▼
  ┌───────────────────────────────── backend/ (FastAPI) ─────────────────────────────────┐
  │ controllers ─▶ Depends(session, current user, role) ─▶ services ─▶ repositories ─────┼──▶ PostgreSQL + pgvector
  │                                                          │                           │
  │ chat service ─▶ integrations/llm (Gemini) ◀──tool calls──┘ (same services & checks)  │
  │ bylaw service ─▶ integrations/embeddings (TEI) ──────────────────────────────────────┼──▶ embedding service
  └───────────────────────────────────────────────────────────────────────────────────────┘
  MCP server (app/mcp, HTTP /mcp or stdio) ─▶ same tools, services and permission checks
```

The request flows:

1. **API:** client → controller (`/api/v1`) → `Depends` (DB session, user, role) → service → repository → Postgres → Pydantic response.
2. **Chat and tools:** controller → chat service → `app/integrations/llm/` → the model chooses a tool → the tool calls a service and repository → the result goes back to the model → answer.
3. **RAG:** ingest splits the bylaw one clause per chunk, embeds it and stores it in pgvector. A question is embedded, similar clauses are fetched, and the model answers from them or says nothing matched.
4. **MCP:** client → `/mcp` or stdio → tool, resource or prompt → the same services → database.
5. **Auth:** register hashes the password (argon2); login issues a JWT with an expiry; each request checks the token and reads the role from the database.

## Quick start

You need **Docker Desktop**, **Node.js 18+** for the frontend, and optionally
[uv](https://docs.astral.sh/uv/) to run the backend tests on your machine.

### 1. Backend

```bash
git clone https://github.com/moniruzzamanshawon17/samity-khata.git
cd samity-khata/backend

cp .env.example .env
# Edit .env. The app needs DB_NAME, DB_USER, DB_PASSWORD and JWT_SECRET (see Configuration).
# Optionally set LLM_API_KEY and LLM_MODEL for the chat assistant.

docker compose up -d --build                  # db, embedding model, API (runs migrations), MCP server
docker compose exec api python -m scripts.seed   # demo samity, members, loans, and both bylaws
```

To generate a JWT secret, run `python -c "import secrets; print(secrets.token_hex(32))"`.

| Service | URL |
|---|---|
| API docs (Swagger) | http://localhost:8002/docs |
| Health check | http://localhost:8002/health |
| MCP server (streamable HTTP) | http://localhost:8003/mcp |
| PostgreSQL | localhost:5433 |
| Embedding service | http://localhost:8080 |

The first start downloads the embedding model, which takes a minute or two. If the seed runs
before the embedding service is ready, it skips the bylaws; load them afterwards with
[`scripts.ingest_bylaws`](#loading-the-bylaws). The API reloads itself when you edit code; after
an MCP edit, run `docker compose restart mcp`.

### 2. Frontend

```bash
cd samity-khata/frontend
cp .env.example .env      # optional: the defaults work with the Docker backend
npm install
npm run dev               # http://localhost:5173
```

Sign in with one of the [demo logins](#demo-data-and-logins).

## Demo data and logins

`backend/scripts/seed.py` goes through the same services as the API, so the bylaw rules apply to
the demo data too. Running it a second time changes nothing.

It creates the samity "Shapla Sanchay O Rindan Samabay Samity Ltd" with:

- **10 members** with up to two years of monthly deposits of ৳500.
  - Member 8 has missed 4 deposits, so its bylaw status is *inactive* (Clause 2.4).
  - Member 10 joined 2 months ago, so it is too new for a loan (Clause 4.1a).
- **A withdrawal** for member 4, and **a mistaken deposit** for member 5 that was then reversed.
- **3 loans:** #1 Rahima, repaid on time · #2 Karim, **overdue** · #3 Salma, fully repaid and **closed**.
- **The English and Bangla bylaws**, ingested for RAG.

Every login uses the password `samity-demo-123`:

| Role | Email | Can |
|---|---|---|
| admin (secretary) | `secretary@example.com` | everything, including withdrawals, reversals and loans |
| staff (collector) | `collector@example.com` | read everything, record deposits and repayments |
| customer | `rahima@example.com` | own member #1, loan #1 |
| customer | `karim@example.com` | own member #2, loan #2 |
| customer | `salma@example.com` | own member #3, loan #3 |

More admin or staff accounts are created from the command line (public sign-up always creates a
customer):

```bash
docker compose exec api python -m scripts.create_user --name "Nasrin Akter" --email nasrin@example.com --role staff
```

To start over, run `docker compose down -v` (**this deletes all data**), then `docker compose up -d`
and seed again.

## Configuration

### Backend (`backend/.env`)

All settings are read with pydantic-settings. The app refuses to start if a required setting is
missing. Never commit `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | **required** | PostgreSQL login and database (also used by Docker Compose) |
| `DB_HOST`, `DB_PORT` | `localhost`, `5433` | Compose sets `db:5432` inside Docker |
| `JWT_SECRET` | **required**, at least 32 characters | Signs access tokens |
| `JWT_EXPIRE_MINUTES` | `60` | Token lifetime |
| `EMBEDDING_URL` | **required** | Embedding service, e.g. `http://localhost:8080` |
| `EMBEDDING_DIM` | `384` | Must match the model and the pgvector column |
| `RAG_SIMILARITY_THRESHOLD` | `0.35` | Bylaw hits below this cosine similarity are dropped. We use `0.81`, calibrated with `scripts/rag_scores.py` |
| `LLM_API_KEY`, `LLM_MODEL` | unset | Gemini key and model; `/chat` returns 503 until both are set |
| `LLM_MAX_TOOL_STEPS` | `6` | Maximum tool rounds per chat answer |
| `MCP_USER_EMAIL` | unset | The user the **stdio** MCP server acts as |
| `MCP_PUBLIC_URL` | `http://localhost:8003` | Where clients reach the HTTP MCP server |
| `API_HOST_PORT`, `MCP_HOST_PORT`, `DB_HOST_PORT`, `EMBEDDING_HOST_PORT` | `8002`, `8003`, `5433`, `8080` | Ports on your machine |

### Frontend (`frontend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:8002` | Where `npm run dev` / `npm run preview` forward `/api/*` |
| `VITE_API_BASE` | `/api/v1` | Base URL the browser calls; keep the default with the proxy or a same-origin rewrite |

## API reference with examples

Every route is under `/api/v1`. Money is always an **integer number of paisa** (৳1 = 100 paisa),
so `50000` means ৳500. Errors are JSON in the form `{"detail": ...}` and never contain a stack
trace or a raw database error.

| Code | Meaning |
|---|---|
| 201 | Created |
| 204 | Deleted |
| 401 | No token, or the token is invalid or expired |
| 403 | Your role can't do this, or the record belongs to someone else |
| 404 | Not found |
| 409 | Conflict: duplicate, or already reversed |
| 422 | Invalid input, or the bylaw doesn't allow it |
| 503 | The embedding service or the chat model is down |

The examples use bash. Log in once and keep the token:

```bash
API=http://localhost:8002/api/v1
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"secretary@example.com","password":"samity-demo-123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
AUTH="Authorization: Bearer $TOKEN"
```

### Auth

| Method and path | Who | Notes |
|---|---|---|
| `POST /auth/register` | anyone | Always creates a **customer**. A `role` field is ignored |
| `POST /auth/login` | anyone | Returns `access_token`, `token_type` and `expires_in`. A wrong email and a wrong password give the same 401 |
| `GET /auth/me` | logged in | The current user |

```bash
curl -X POST $API/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Rokeya Sultana","email":"rokeya@example.com","password":"StrongPass123"}'     # 201, 409 if the email exists
curl -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"rahima@example.com","password":"samity-demo-123"}'                          # 200, 401 on a wrong password
curl $API/auth/me -H "$AUTH"                                                                # 200, 401 without a token
```

### Samities

| Method and path | Who |
|---|---|
| `GET /samities?page=1&size=20` | staff, admin |
| `GET /samities/{id}` | staff, admin |
| `POST /samities` | admin |
| `PATCH /samities/{id}` | admin |

```bash
curl "$API/samities" -H "$AUTH"
curl $API/samities/1 -H "$AUTH"                                                             # 404 if missing
curl -X POST $API/samities -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Padma Samity","union":"Shantinagar","monthly_deposit_paisa":50000}'           # 201, 409 if the name is taken
curl -X PATCH $API/samities/1 -H "$AUTH" -H "Content-Type: application/json" -d '{"union":"Rupnagar"}'
```

### Members (full CRUD)

| Method and path | Who | Notes |
|---|---|---|
| `GET /members?samity_id=&status=&q=&page=&size=` | staff, admin | `q` searches name, phone and member number |
| `GET /members/{id}` | staff, admin, or the member's own customer | Anyone else gets 403 |
| `POST /members` | admin | `member_no` is unique within a samity (409) |
| `PATCH /members/{id}` | admin | |
| `DELETE /members/{id}` | admin | 409 if the member has transactions or loans |

```bash
curl "$API/members?samity_id=1&status=active&q=Begum&page=1&size=5" -H "$AUTH"
curl $API/members/1 -H "$AUTH"
curl -X POST $API/members -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"samity_id":1,"member_no":"SSR-0011","name":"Lily Akter","phone":"01712345611","joined_on":"2026-01-01"}'
curl -X PATCH $API/members/11 -H "$AUTH" -H "Content-Type: application/json" -d '{"status":"inactive"}'
curl -X DELETE $API/members/11 -H "$AUTH"                                                   # 204
```

### Transactions (append-only)

| Method and path | Who | Notes |
|---|---|---|
| `POST /transactions` | staff, admin | `type`: `deposit`, `withdrawal` (admin only), or `repayment` (needs `loan_id`) |
| `GET /transactions?member_id=&from=&to=&page=&size=` | logged in | Customers only see their own |
| `POST /transactions/{id}/reverse` | admin | Adds a `reversal` row; nothing is ever edited or deleted |

```bash
curl -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"member_id":1,"type":"deposit","amount_paisa":50000,"occurred_on":"2026-11-10"}'      # 201
curl -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"member_id":4,"type":"withdrawal","amount_paisa":100000}'                            # 422: over 50% of savings, or a 2nd withdrawal in 12 months
curl -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"member_id":2,"type":"repayment","amount_paisa":177700,"loan_id":2}'
curl "$API/transactions?member_id=1&from=2026-01-01&to=2026-06-30" -H "$AUTH"
curl -X POST $API/transactions/5/reverse -H "$AUTH"                                         # 201, then 409 if reversed again
```

### Balance

| Method and path | Who |
|---|---|
| `GET /members/{id}/balance` | staff, admin, or the member's own customer |

The response includes the savings balance, totals by type, unpaid monthly deposits, the bylaw
status, the most the member can withdraw now (Clause 3.5) and the largest loan they could get
(Clause 4.2).

```bash
curl $API/members/1/balance -H "$AUTH"
curl $API/members/8/balance -H "$AUTH"   # "unpaid_deposits": 4, "bylaw_status": "inactive"
```

### Loans

| Method and path | Who | Notes |
|---|---|---|
| `POST /loans` | admin | `term_months` must be 6, 12, 18 or 24. The rate and instalment come from the bylaw |
| `GET /loans?status=&member_id=&page=&size=` | staff, admin | `status`: `active`, `overdue` or `closed` |
| `GET /loans/{id}` | staff, admin, or the borrower | Includes the amount still owed, the amount due now and the next due date |
| `GET /loans/{id}/schedule` | staff, admin, or the borrower | The planned instalments |

```bash
curl -X POST $API/loans -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"member_id":4,"principal_paisa":2000000,"term_months":12}'   # 201; 422 if not eligible, 409 if a loan is already open
curl "$API/loans?status=overdue" -H "$AUTH"
curl $API/loans/1 -H "$AUTH"
curl $API/loans/1/schedule -H "$AUTH"
```

### Bylaws (RAG)

| Method and path | Who | Notes |
|---|---|---|
| `POST /bylaws/ingest` | admin | Multipart form: `file` (a text PDF or `.md`, up to 10 MB), optional `title` and `samity_id`. Uploading the same title again replaces it |
| `GET /bylaws` | logged in | The uploaded documents |
| `GET /bylaws/search?q=&samity_id=&limit=` | logged in | Clauses ranked by cosine similarity |

```bash
curl -X POST $API/bylaws/ingest -H "$AUTH" -F "file=@data/bylaws/bylaw_en.md" -F "samity_id=1"
curl $API/bylaws -H "$AUTH"
curl -G $API/bylaws/search -H "$AUTH" --data-urlencode "q=দেরিতে জমা দিলে জরিমানা কত?"
```

### Chat

| Method and path | Who |
|---|---|
| `POST /chat` | logged in |

```bash
curl -X POST $API/chat -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"message":"Which loans are overdue, and what does the bylaw say about late instalments?","history":[]}'
```

## Chat assistant

`POST /chat` sends the question to Gemini (through `app/integrations/llm/`) with a system prompt
that sets the assistant's role and limits, and seven **read-only tools**:

`find_members` (staff and admin only) · `get_member` · `get_balance` · `list_transactions` ·
`get_loans` · `get_loan_schedule` · `search_bylaws`

- The model decides when to call a tool. The backend runs it **as the logged-in user**, through
  the same services and permission checks as the API, and sends the result back to the model.
  When a customer asks about someone else's balance, the tool returns 403 and the assistant
  explains that it can't show it.
- Rule questions always go through `search_bylaws`, and the answer cites the clause, for example
  "(Clause 3.2)" or "(ধারা ৩.২)". When nothing passes the similarity threshold, the assistant
  says the bylaws don't cover the question.
- The server keeps no chat state. To continue a conversation, send the earlier turns in `history`
  (multi-turn). The response lists the clauses used (`sources`) and every lookup made (`tools_used`).

Try: `আমার সঞ্চয় কত?` (as Rahima) · `When is my next instalment due?` (as Karim) ·
`দেরিতে জমা দিলে জরিমানা কত?` · `Can I get a loan for a wedding?` (not covered, Clause 4.3).

## MCP server

The same tools are exposed over the [Model Context Protocol](https://modelcontextprotocol.io),
together with resources and prompts:

| Kind | Items |
|---|---|
| Tools (all read-only) | `who_am_i`, `find_members`, `get_member`, `get_balance`, `list_transactions`, `get_loans`, `get_loan_schedule`, `search_bylaws` |
| Resources | `samity://me`, `samity://members/{member_id}`, `samity://bylaws`, `samity://bylaws/{document_id}` (full text) |
| Prompts | `member_summary`, `explain_rule`, `loan_eligibility` |

Two transports:

- **Streamable HTTP:** the `mcp` service at `http://localhost:8003/mcp`. Every request needs
  `Authorization: Bearer <token from /auth/login>`; without one you get 401.
- **stdio:** from `backend/`, run `uv run python -m app.mcp`. It acts as the user in `MCP_USER_EMAIL`.

To try the HTTP server, run `npx @modelcontextprotocol/inspector` and connect to the URL above
with the bearer header. To use stdio from Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "samity-khata": {
      "command": "uv",
      "args": ["--directory", "/path/to/samity-khata/backend", "run", "python", "-m", "app.mcp"],
      "env": { "MCP_USER_EMAIL": "secretary@example.com" }
    }
  }
}
```

## Frontend

A React + TypeScript single-page app in `frontend/`, built with Vite. Full details are in
[`frontend/README.md`](frontend/README.md).

| Area | What it offers |
|---|---|
| **Public pages** | Landing page (`/`), pricing (`/pricing`), sign-in |
| **Secretary / collector app** | Dashboard, members (search, filter, add/edit/delete), collect (deposits and repayments), ledger with reversals, loans with eligibility check and EMI preview, loan schedule, bylaws (upload and semantic search), assistant, settings |
| **Member app** (`/me`) | Savings, what can be withdrawn, loan schedule, history, and the assistant: mobile-first, Bangla by default |

- **Role-aware.** The menu and the actions follow the logged-in role (for example, collectors
  can't record withdrawals and members only see their own data).
- **Bilingual.** An EN / বাং switch translates the interface and shows taka, dates and phone
  numbers in Bangla digits.
- **Responsive.** Full sidebar on desktop, icon rail on tablets, and a menu drawer with card-style
  tables on phones (tested at 360 to 1440 px).
- **Assistant UI.** Shows each lookup in plain words ("Looked up: Checked loans of member 2"),
  clause sources, a working indicator with Stop / Retry, and supports streamed answers when the
  backend offers `/chat/stream` (it falls back to `/chat` today).
- **Talks to the API on the same origin.** The backend sends no CORS headers, so the dev server
  proxies `/api/*` to FastAPI; in production use a same-origin rewrite (see [Deployment](#deployment)).

```bash
cd frontend
npm run dev        # development server on http://localhost:5173
npm run build      # type-check and production build into frontend/dist
npm run preview    # serve the production build with the same API proxy
```

## Tests

```bash
cd backend
docker compose up -d db
uv run pytest
```

The backend has 73 tests in two groups:

- **Unit tests** cover the bylaw rules, the loan ledger, the Gemini tool loop and the MCP wiring.
  They need no database.
- **API tests** (`tests/api/`) call every route in-process against a separate database,
  `samity_khata_test`, which the tests create, migrate and empty before each test. They check the
  status codes (201/204/401/403/404/409/422/503) and the bylaw rules behind them. Embeddings and
  the chat model are replaced with fakes, so only the `db` container is needed. If Postgres isn't
  reachable, they are skipped.

The frontend is type-checked with `npm run build` (or `npm run typecheck`).

## Deployment

**Backend (Render, Docker):**

1. Create a PostgreSQL database with the `vector` extension available, and an embedding service
   (the `ghcr.io/huggingface/text-embeddings-inference` image with `--model-id intfloat/multilingual-e5-small`).
2. Create a Web Service from this repository with **Root Directory** `backend` and the Docker runtime.
3. Set the **Docker command** to `sh start.sh`: it runs `alembic upgrade head` and starts Uvicorn on Render's `$PORT`.
4. Add the environment variables from [Configuration](#configuration).
5. Seed and load the bylaws once from the service shell: `python -m scripts.seed`.

The live Swagger UI is then at `https://<your-service>.onrender.com/docs`.

**Frontend (Render Static Site, or any static host):**

- Root directory `frontend`, build command `npm ci && npm run build`, publish directory `dist`.
- Rewrite `/api/*` to `https://<your-api>.onrender.com/api/*` so the browser stays on one origin,
  and `/*` to `/index.html` so deep links work.

## Design decisions

- **Money is integer paisa** everywhere: database, API and calculations. No floats.
- **Transactions are append-only.** A PostgreSQL trigger rejects `UPDATE` and `DELETE`; a mistake
  is corrected with a `reversal` row. Balances are always computed from the rows, so they can't drift.
- **No race conditions on money.** A transaction locks the member row (`SELECT … FOR UPDATE`), so
  two withdrawals at the same moment can't both pass the 50% check. A partial unique index allows
  only one open loan per member.
- **The loan ledger is replayed** from the disbursement date. Interest falls due on each due date,
  a payment covers interest first, and a reversed repayment drops out of the replay. Reversing a
  payoff reopens the loan, and `overdue` (15 days' grace, Clause 5.1) is always current.
- **The role is read from the database on every request**, not from the token, so a role change
  or a deleted account takes effect immediately.
- **Login timing is equalised** with a dummy hash, so a wrong email and a wrong password look the same.
- **The bylaw drives the code.** EMI, terms, grace period, eligibility, loan ceiling and withdrawal
  limits are enforced, each with its clause number in the error message.
- **Bilingual RAG.** The bylaw is chunked one clause per chunk and embedded with
  multilingual-e5-small using the `passage:` and `query:` prefixes. A similarity threshold stops
  unrelated questions from returning random clauses.
- **The LLM can only read, and is optional.** Chat and MCP tools never write. Without a key,
  `/chat` returns 503 and everything else works.
- **Layered modules.** One folder per feature under `app/modules/`; controllers only handle HTTP,
  logic lives in services, queries in repositories, all wired with `Depends`.

## Known limitations

- **Fines** (Clauses 3.2 and 5.2) are calculated and shown as guidance but not posted to the ledger.
- **Guarantors** (Clause 4.1d) and **shares** (the 40× share part of Clause 4.2) are not recorded yet.
- **One samity per deployment in practice.** Several samities can be stored, but users are not yet
  scoped to a samity, and loans and transactions can't be filtered by samity.
- **No streaming endpoint yet.** The frontend is ready for `/chat/stream` and falls back to `/chat`.
- **No summary endpoint.** The dashboard adds up the list endpoints in the browser, which is fine
  for samities of a few hundred members.
- The free Gemini tier allows only a few questions a day, because each answer can use several model calls.

## Project layout

```
samity-khata/
├── backend/                 FastAPI service
│   ├── app/
│   │   ├── core/            config, security (JWT, argon2), exceptions and handlers, shared schemas
│   │   ├── db/              engine/session, Base, model registry
│   │   ├── modules/         one folder per feature: models, schemas, repositories, services, controllers
│   │   │                    auth/ samities/ members/ transactions/ loans/ bylaws/ chat/
│   │   ├── integrations/    embeddings client (TEI), llm (Gemini client, prompts)
│   │   └── mcp/             MCP server (tools, resources, prompts), auth, entry point
│   ├── alembic/             migrations (incl. the append-only trigger and the pgvector HNSW index)
│   ├── data/bylaws/         English and Bangla bylaw
│   ├── scripts/             seed, create_user, ingest_bylaws, rag_scores
│   ├── tests/               unit tests; tests/api/ end-to-end API tests
│   ├── docs/                bylaw notes
│   └── Dockerfile, docker-compose.yml, start.sh, pyproject.toml, uv.lock
└── frontend/                React + TypeScript + Vite web app
    ├── src/
    │   ├── pages/           one file per screen; pages/portal/ for the member app
    │   ├── components/      app shell, drawer, chat, navbar parts, UI primitives
    │   ├── lib/             API client, types, auth, i18n (EN/বাং), formatting, loan maths, prices
    │   └── assets/brand/    logo and mark (SVG)
    └── public/              favicon and app icons
```

## Bylaws and business rules

The samity's rules come from a sample bilingual bylaw for the fictional
**Shapla Sanchay O Rindan Samabay Samity Ltd**:

- `backend/data/bylaws/bylaw_en.md` (English)
- `backend/data/bylaws/bylaw_bn.md` (Bangla)

Each `####` heading is one clause and one RAG chunk (38 clauses per language, 240 to 470
characters each). English and Bangla chunks share the same clause id, such as `3.2`, so a question
in either language returns the same rule. The bylaw is a teaching model and **is not a registered
document**. Values marked "illustrative" below are realistic examples that a samity would confirm
or change for its own bylaw.

### Why not the Bangladesh Samabaya Bank bylaw?

The bylaw of Bangladesh Samabaya Bank Ltd (BSBL) was reviewed first and rejected for three reasons:

- BSBL is an apex cooperative bank whose members are other cooperative societies, not individual people.
- It has no rules for monthly deposits, instalments, overdue status, fines or member data access.
- It is a scanned image with no text, so it cannot be ingested.

### Which law applies

A primary savings and credit samity is governed by:

- the Cooperative Societies Act 2001, amended in 2002 and 2013
- the Cooperative Societies Rules 2004, amended in 2020
- supervision by the Department of Cooperatives

The MRA's 24% declining-balance interest cap applies only to MRA-certified microcredit
organisations. It is used here only as a benchmark.

### Rule → clause → code

"Enforced" means the API refuses anything that breaks the rule. "Documented only" means the bylaw
states it and `bylaw_rules.py` may have the formula, but the API does not apply it yet.

| Rule | Clause | Value | Status | Where |
|---|---|---|---|---|
| Member number | 2.3 | `SSR-0001`, never reused | Documented only (unique per samity, format not checked) | `members` |
| Active / inactive | 2.4 | inactive at 3 unpaid deposits | Calculated and shown; loans refused | `unpaid_deposits`, `member_status`, `GET /members/{id}/balance` |
| Monthly deposit | 3.1 | ৳500, due on the 10th | Enforced for loan eligibility | `samities.monthly_deposit_paisa`, `deposits_due` |
| Late deposit fine | 3.2 | ৳10, then +৳10 every 30 days, max ৳50 | Documented only (no fine entries yet) | `late_deposit_fine` |
| Savings balance | 3.3 | deposits − withdrawals, always calculated | Enforced | `GET /members/{id}/balance` |
| Corrections | 3.4 | reversing entry only, never update or delete | Enforced (API and database trigger) | `POST /transactions/{id}/reverse` |
| Withdrawal | 3.5 | ≤ 50%, once in 12 months; keep ≥ ⅓ of loan principal | Enforced (15-day notice not tracked) | `max_withdrawal` |
| Loan eligibility | 4.1 | 6 months' membership, no unpaid deposits, one open loan | Enforced (guarantor rule 4.1d not tracked) | `LoanService._check_eligible` |
| Loan ceiling | 4.2 | min(3× savings, 40× shares, ৳50,000) | Enforced without the share limit (shares not recorded) | `loan_ceiling` |
| Interest | 4.6 | 12% a year, reducing balance, 1% a month | Enforced | `monthly_interest`, `loans/calculations.py` |
| Instalment | 4.7 | EMI formula, rounded up to whole taka | Enforced | `instalment_amount`, `GET /loans/{id}/schedule` |
| Terms and due dates | 4.8 | 6, 12, 18 or 24 months, due on the 10th, prepayment allowed | Enforced | `instalment_due_dates`, `loan_position` |
| Overdue | 5.1 | unpaid > 15 days after due date | Enforced (status updates itself) | `is_overdue`, `loan_position` |
| Late instalment fine | 5.2 | ৳20 on day 16, +৳20 every 30 days, max ৳100 | Documented only (no fine entries yet) | `late_instalment_fine` |
| Admin (secretary) | 6.1 | full write access, reversals | Enforced | role checks |
| Staff (collector) | 6.2 | records deposits and instalments only | Enforced: no withdrawals, loans, members or reversals | role checks |
| Member | 6.3, 6.4 | own records only, 403 for others | Enforced | `AccessibleMember`, loan and transaction checks |
| Not covered | 7.7 | reply "not in the bylaws" | Via the RAG similarity threshold | `RAG_SIMILARITY_THRESHOLD` |

### How a repayment is applied

Interest is charged on each due date (the 10th) at 1% of the principal still outstanding. A
repayment pays unpaid interest first, then principal. Paying early lowers the principal, so later
interest is smaller and the loan closes sooner (Clause 4.8). Everything is recalculated from the
repayment rows, so reversing a repayment reopens the loan. A loan is overdue when the total repaid
is less than the instalments whose due date passed more than 15 days ago.

### Loading the bylaws

Each `####` heading becomes one chunk. Load both languages for the same samity (the seed script
does this for you when the embedding service is up):

```bash
cd backend
docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_en.md --samity-id 1
docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_bn.md --samity-id 1
```

Admins can also upload a bylaw (text PDF or Markdown) from the **Bylaws** page in the web app.

### Worked loan example (Clause 4.7)

The example loan is ৳20,000 over 12 months at 12% on the reducing balance:

- **Instalment:** 20,000 × 0.01 ÷ (1 − 1.01⁻¹²) = 1,776.98. Rounded up, that is ৳1,777 (177,700 paisa).
- **Payments:** 11 payments of ৳1,777, then a last payment of ৳1,776.70.
- **Total interest:** ৳1,323.70. A 12% *flat* rate would charge ৳2,400.

`tests/test_bylaw_rules.py` checks this schedule to the paisa, and `tests/test_loan_ledger.py`
checks that the loan ledger reaches the same ৳1,323.70 of interest when paid on time.

### Legal basis and illustrative values

| Item | Source |
|---|---|
| No deposits from or loans to non-members (1.3) | Act s.26(1) |
| Shares, one-fifth cap, transfer only (2.2) | Act s.15 |
| Loan ≤ 40× paid-up shares (4.2b) | Rules r.74(1), as quoted by district cooperative offices |
| 25% liquidity (3.6) | Department of Cooperatives guidance (district offices cite 20% or 25%) |
| 15% reserve, 3% Cooperative Development Fund, profit order (7.4) | Act s.34 |
| Committee term, age, AGM, quorum (7.1, 7.3) | Act s.17–19 |
| Audit, disputes, amendment (7.5–7.7) | Act s.43, s.50, s.13 |
| **Illustrative values:** admission fee ৳100, share ৳500, deposit ৳500, due date the 10th, both fines, 12% rate, 15-day grace period, 3× savings, ৳50,000 cap, withdrawal limits, 6-member committee, 10-year record keeping | Typical values; each samity sets its own |

### RAG test questions

| Question | Expected |
|---|---|
| What is the late-payment rule? | Clause 3.2 (deposit) and/or 5.2 (instalment), quoted |
| দেরিতে জমা দিলে কী হয়? | ধারা ৩.২, answered in Bangla |
| Can I borrow for a wedding? | Not in the bylaws (4.3 lists purposes; weddings are not one) |
| Who is the chairman's brother? | Not in the bylaws, no guess |

A test confirms that the words wedding, marriage, brother and chairman, and their Bangla
equivalents, never appear in either bylaw file. That keeps both "not in the bylaws" answers honest.
