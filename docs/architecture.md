# Architecture

## Request flow: a client writes "Сколько стоит окрашивание? Можно в среду?"

1. The messenger provider calls `POST /api/channels/<business id>/whatsapp/inbound` with the header `x-channel-secret` (Telegram goes through the business's own bot adapter, same code path). The business id picks the business; the secret proves the sender.
2. From here on the request runs "inside" that business: every database connection it takes has `search_path` set to the business schema and `timezone` set to the business time zone.
3. `conversation.service.receiveInbound` finds the chat by `(messenger, external_user_id)` or creates it, links a known client by `client_channels`, stores the message and publishes a `changed` event stamped with the business.
4. The route answers the webhook at once and starts `runner.replyTo(conversation)`. One AI run per chat at a time; a message that arrives during a run queues exactly one more run.
5. The engine reads a snapshot (services, masters, knowledge base, settings) and calls tools:
   `find_free_slots` → `link_client` → `create_appointment` → `create_payment_link`.
   Tools validate input with zod and go through the same services as the admin UI, so every database rule applies.
6. The reply is stored, the run is logged in `ai_runs` (latency, tool calls, tokens), and the browsers signed in to that business, and only those, update over Server-Sent Events.

A request from the web CRM works the same way: the `vx_session` cookie names the user, the user belongs to one business, and the request runs inside it.

## Decisions

| # | Decision | Why |
|---|---|---|
| ADR-1 | The AI never writes SQL. It calls 7 typed tools. | A wrong or injected query could leak other clients' data or break the schedule. Tools check the client of *this* chat. |
| ADR-2 | PostgreSQL with an EXCLUDE constraint for bookings | Two clients can ask for the same slot in the same second. Only the database can decide that safely. The test fires 8 simultaneous inserts: 1 wins, 7 get `23P01`. |
| ADR-3 | Two AI engines behind one interface | Claude (manual tool loop over the Messages API) when a key is set; a deterministic Russian/English rule engine otherwise. The project works and is testable without paid API access. |
| ADR-4 | Read-only SQL console role | Owners can explore data and run the Task 9 query without any risk of changing it. Off by default in production, because a console is a teaching tool, not something to give every business on a shared server. |
| ADR-5 | Visit times are local `TIMESTAMP` in the business's time zone | A salon thinks in wall-clock time. The server process runs in UTC; each database session runs in the business's zone, so `LOCALTIMESTAMP` and "today" mean the business's today. Created/updated stamps are `TIMESTAMPTZ`. |
| ADR-6 | Vanilla ES modules for the web app | Small bundle, no framework to learn for the team; Vite builds four pages: landing, CRM, Terms, Privacy. |
| ADR-7 | One PostgreSQL schema per business | Every repository keeps its plain SQL; the pool sets `search_path` per business. A forgotten `WHERE business_id = …` cannot leak data, and a query that runs for no business fails because only `public` is visible. |
| ADR-8 | Sessions in the database, token stored only as a SHA-256 hash | Signing out and resetting a password end sessions at once; a database leak does not leak logins. |
| ADR-9 | Money columns keep the `_kzt` suffix | They hold whole units of the business's currency. Renaming them would touch every query, view and report for no change in behaviour. |
