# Database

PostgreSQL 16. Two kinds of migrations:

- [`db/migrations/core`](../db/migrations/core): shared tables in the `public` schema, recorded in `public.schema_migrations`.
- [`db/migrations/tenant`](../db/migrations/tenant): the CRM tables. They are applied to the schema of every business, `t_<business id without dashes>`, and recorded in that schema's `tenant_migrations`. Main schema: [`001_init.sql`](../db/migrations/tenant/001_init.sql), reporting: [`002_reporting.sql`](../db/migrations/tenant/002_reporting.sql).

Migrations run in order, each in its own transaction. A new business gets its schema inside the sign-up transaction, so a failed sign-up leaves nothing behind.

## Shared tables (schema `public`)

| Table | Purpose |
|---|---|
| businesses | one row per business: name, country, time zone, currency; `business_schema` is generated from the id |
| users | people who sign in: email, scrypt password hash or Google account id, role |
| sessions | sign-in sessions; only a SHA-256 hash of the token is stored |
| password_resets | one-time reset links, valid for one hour; only a hash of the token is stored |

## Tables of one business (schema `t_…`)

![ERD](images/erd.png)

| Table | Rows (demo) | Purpose |
|---|---|---|
| clients | 30 | one card per real person |
| client_channels | 35 | messenger accounts of a client, `UNIQUE (messenger, external_user_id)` |
| services | 8 | catalogue and prices the AI may offer |
| masters | 4 | staff, working hours and days |
| master_services | 16 | bridge table, M:N masters ↔ services |
| master_accounts | 4 | 1:1 login, only a password hash |
| appointments | about 250 | visits; EXCLUDE constraint prevents overlaps |
| payments | about 180 | prepayments and full payments |
| conversations | 4 | one chat = one deal in the funnel |
| messages | 16 | chat history |
| knowledge_entries | 6 | what the AI knows beyond the tables |
| ai_runs | 0 | every AI reply with latency (NFR-01) |
| business_settings | 1 | name, hours, prepayment rule |
| integrations | 0 | connected services, their settings and secrets |
| appointment_reminders | 0 | which visit reminders were sent or skipped |

Row counts are from a seed run on 2 November 2026. Visits and payments are generated around the day the seed runs, so their number changes a little from day to day.

Money columns (`price_kzt`, `amount_kzt`, `prepay_min_price_kzt`) keep the name from the first version. They hold whole units of the business's own currency.

## Task 9 query

```sql
SELECT service, finished_visits, no_shows, no_show_pct, lost_revenue_kzt
FROM v_no_show_by_service
WHERE month = date_trunc('month', now())::date
ORDER BY no_show_pct DESC;
```

For the previous month use `date_trunc('month', now() - interval '1 month')`. The demo data is generated around the day the seed runs with a fixed random seed, so the same day always gives the same numbers. Seeded on 2 November 2026, October 2026 shows: VIP-ритуал 9 no-shows out of 19 finished visits (47.4%) and 198 000 ₸ lost, then Камуфляж седины 25.0% and Стрижка и борода 17.4%. Decision: 30% prepayment for services from 20 000 ₸; the AI sends the payment link when booking.

## Payment transaction

`booking.service.markPaid` locks the payment, sets it `Paid`, confirms the visit, moves the chat to `Paid` and writes a chat note in one transaction. A repeated webhook changes nothing.

## Visit reminders

Migration `tenant/006_reminders.sql` adds `appointment_reminders`, one row per appointment and reminder kind (`24h`, `2h`). Every minute the server checks each business on its own clock (`services/reminder.service.ts`) and writes the reminder into the client's latest chat, in the language the client writes in, so it goes out through the same messenger. A visit booked after its reminder window opened, or a client without a chat, is recorded as `skipped`, so nothing is sent twice or retried.

## Starting over

`npm run db:reset` drops every business schema and the `public` schema and applies the core migrations again. It is the way from the layout before accounts (all tables in `public`) to the current one, and it refuses to run with `NODE_ENV=production`.
