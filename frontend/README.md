# Samity Khata — frontend

React + TypeScript (Vite) web app for the Samity Khata API. One login for three roles:

| Role | What they get |
|---|---|
| **Admin (secretary)** | Dashboard, members CRUD, collect (incl. withdrawals), ledger with reversals, loans (issue + schedule), bylaw upload & search, assistant, settings |
| **Staff (collector)** | Collect (deposits + repayments only), members / ledger / loans read-only, bylaws, assistant |
| **Customer (member)** | Mobile-first member app at `/me`: savings, loan schedule, history, assistant — Bangla or English |

Built from the design canvas "Samity Khata UI Design" ("Khata Green": Inter + Hind Siliguri, money in lakh format).

## Run it

The backend must be running first (`docker compose up` in the repo root → API on `http://localhost:8002`).

```bash
cd frontend
cp .env.example .env        # optional; defaults work for local Docker
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (after `scripts/seed.py`), password `samity-demo-123`: `secretary@example.com`, `collector@example.com`, `rahima@example.com`. The sign-in page fills them in with one click.

Other scripts: `npm run build` (type-check + production build to `dist/`), `npm run preview` (serve the build with the same API proxy), `npm run typecheck`.

## How it talks to the API

- The backend sends no CORS headers, so the browser only ever calls **its own origin**. `vite.config.ts` proxies `/api/*` to `VITE_API_PROXY_TARGET` (default `http://localhost:8002`) in `dev` and `preview`.
- `src/lib/api.ts` is the single HTTP client: adds the Bearer token, turns FastAPI errors (string or 422 list) into readable messages, and signs out on 401.
- Money is paisa everywhere in the API; `src/lib/format.ts` shows taka (`Tk 1,86,500.00`, or `৳ ১,৮৬,৫০০.০০` in Bangla).
- The token lives in `localStorage` until its `expires_in`; chat history is per browser tab (`sessionStorage`) and sent as `history` with each message, because the server keeps no chat state.

## Streaming chat answers

The chat (`src/components/Chat.tsx`, `src/lib/chatStream.ts`) first tries **`POST /api/v1/chat/stream`**. If that returns 404/405 it falls back to `POST /api/v1/chat` for the rest of the page load, so it works with or without a streaming backend.

Contract the backend endpoint must follow:

- **Request:** the same JSON body as `/chat`: `{"message": "...", "history": [{"role": "user"|"assistant", "content": "..."}]}`, with a Bearer token.
- **Errors before the answer starts:** a normal JSON error (`401`, `503`, …) exactly like `/chat`.
- **Otherwise:** `Content-Type: text/event-stream`, a series of Server-Sent Events, each a JSON `data:` line followed by a blank line:

```
event: tool
data: {"name": "get_balance", "args": {"member_id": 1}}

event: delta
data: {"text": "Your savings are "}

event: done
data: {"reply": "Your savings are Tk 12,500.", "sources": ["3.3"], "tools_used": [{"name": "get_balance", "args": {"member_id": 1}}]}
```

| Event | When | UI effect |
|---|---|---|
| `tool` | each time the model calls a tool | status line shows the real step ("Checking the balance…"), tool chip appears |
| `delta` | each new piece of answer text | text appears as it arrives |
| `done` | once, at the end | final answer + clause sources (same shape as the `/chat` response) |
| `error` | the model fails mid-answer: `{"status": 503, "detail": "..."}` | partial text is kept, marked interrupted, with Retry |

Lines starting with `:` are ignored (use them as keep-alives). Any event resets the 90-second "no answer" timeout. If the stream ends without `done`, the text received so far is used as the answer. If you run behind a proxy (nginx, Render), make sure it doesn't buffer `text/event-stream` responses.

## Deploying (e.g. Render static site)

- Build command `npm ci && npm run build`, publish directory `frontend/dist`.
- Add a rewrite `/*` → `/index.html` so deep links like `/members/3` work.
- For the API, either add a rewrite `/api/*` → `https://<your-api>.onrender.com/api/*` (keeps everything same-origin), **or** enable CORS for the frontend's URL in the backend and set `VITE_API_BASE=https://<your-api>.onrender.com/api/v1` at build time.

## Things the UI works around (backend gaps)

- **No summary endpoint**: the dashboard adds up `/members`, `/members/{id}/balance`, `/loans` and `/transactions` in the browser. Fine for a samity of a few dozen members; a `GET /stats` endpoint would be faster.
- **Members can't look up their own member record**: the member app finds it from `GET /transactions` (which the API scopes to the caller), and the loan from repayment rows. A member with no transactions yet sees "not linked"; a `GET /members/me` endpoint would remove this.
- **No user list endpoint**: linking a login to a member takes the numeric user id.
- **Ledger type filter**: the API has no `type` filter, so the ledger filters by member and date only.

## Structure

```
src/
  lib/          api client, types (mirror the Pydantic schemas), auth, i18n, formatting, loan maths, data cache
  components/   AppShell (sidebar), PortalShell (member app), Chat, MemberPicker, Markdown, ui primitives
  pages/        one file per screen; pages/portal/ for the member app
```
