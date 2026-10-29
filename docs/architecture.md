# Architecture

## Request flow: a client writes "Сколько стоит окрашивание? Можно в среду?"

1. The messenger provider calls `POST /api/channels/whatsapp/inbound` (Telegram goes through the bot adapter, same code path).
2. `conversation.service.receiveInbound` finds the chat by `(messenger, external_user_id)` or creates it, links a known client by `client_channels`, stores the message and publishes a `changed` event.
3. The route answers the webhook at once and starts `runner.replyTo(conversation)`. One AI run per chat at a time; a message that arrives during a run queues exactly one more run.
4. The engine reads a snapshot (services, masters, knowledge base, settings) and calls tools:
   `find_free_slots` → `link_client` → `create_appointment` → `create_payment_link`.
   Tools validate input with zod and go through the same services as the admin UI, so every database rule applies.
5. The reply is stored, the run is logged in `ai_runs` (latency, tool calls, tokens), and the web CRM updates over Server-Sent Events.

## Decisions

| # | Decision | Why |
|---|---|---|
| ADR-1 | The AI never writes SQL. It calls 7 typed tools. | A wrong or injected query could leak other clients' data or break the schedule. Tools check the client of *this* chat. |
| ADR-2 | PostgreSQL with an EXCLUDE constraint for bookings | Two clients can ask for the same slot in the same second. Only the database can decide that safely. The test fires 8 simultaneous inserts: 1 wins, 7 get `23P01`. |
| ADR-3 | Two AI engines behind one interface | Claude (manual tool loop over the Messages API) when a key is set; a deterministic Russian/English rule engine otherwise. The project works and is testable without paid API access. |
| ADR-4 | Read-only SQL console role | Owners can explore data and run the Task 9 query without any risk of changing it. |
| ADR-5 | Visit times are local `TIMESTAMP` (Asia/Almaty) | A salon thinks in local wall-clock time. Created/updated stamps are `TIMESTAMPTZ`. |
| ADR-6 | Vanilla ES modules for the web app | 58 KB of JS, no framework to learn for the team; Vite for the dev server and build. |
