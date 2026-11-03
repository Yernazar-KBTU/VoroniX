# Testing

`npm test` runs 171 tests with vitest. Each integration test file drops every business schema and the `public` schema of `crm_test`, runs the migrations, creates the demo business Barberista and loads its data, so every run starts from the same state.

| File | Tests | What it proves |
|---|---|---|
| unit/scheduling.test.ts | 9 | free slots respect working hours, other visits, days off, the past and visits after midnight |
| unit/pricing.test.ts | 5 | 30% prepayment from 20 000 ₸ |
| unit/offline-nlu.test.ts | 35 | salon and barbershop services, days, times, phones and names in Russian and English; complaints |
| unit/teach.test.ts | 5 | free notes → promotion, rule, FAQ entries; slogan and hours go to settings; promotion found for a service |
| unit/http-log.test.ts | 3 | request log lines carry no cookies and no secret query values |
| unit/config.test.ts | 3 | empty settings count as not set; on Render the public address comes from `RENDER_EXTERNAL_URL` |
| integration/database.test.ts | 20 | every constraint refuses bad data; 8 concurrent bookings → 1 saved; Task 7 problems P5 and P6; core and business migrations |
| integration/api.test.ts | 25 | booking, 409/400 errors, payment transaction, idempotent payment, read-only SQL |
| integration/auth.test.ts | 19 | sign up, sign in, sessions, guessing limit; a reset link works once and not after it expires; Google sign-in refuses a forged state and an unverified email, and a Google sign-in takes over an address registered without proof |
| integration/tenancy.test.ts | 13 | two businesses never see each other's data; own numbering, time zone and currency; webhooks, calendar feed and live events per business; demo data renames the business |
| integration/ai-flow.test.ts | 12 | webhook → reply → client card → booking → payment link → Paid; complaint → human; NFR-01; taught promotion and brand phrase appear in the next reply |
| integration/integrations.test.ts | 11 | Telegram and Claude tokens checked and never returned; secrets hidden from the SQL console; WhatsApp webhook secret; iCal feed; outgoing webhook on a new booking |
| integration/reminders.test.ts | 5 | reminders 24 h and 2 h before a visit, once, in the client's chat and language; none for cancelled visits or visits booked inside the window |
| integration/web.test.ts | 6 | landing page on `/`, the CRM on `/app`, Terms and Privacy, 404 for unknown pages, long cache for built files |

A bug found by the tests: inserting a payment failed with `inconsistent types deduced for parameter $5`, because the same parameter was used as a column value and in a `CASE`. Fixed with an explicit `::text` cast.

## Load test

`tests/load/run.mjs` (autocannon), 10 s per scenario, single Node process, against a server with the demo business (`npm run db:seed`). It signs in as the demo owner and connects the demo business's WhatsApp webhook first. Result in `reports/load-test.json`: 0 errors in all 7 scenarios; 2 646 webhook messages accepted, each starting an AI run, webhook p99 119 ms. Run it with `BASE_URL=... npm run test:load`; set `DEMO_EMAIL` and `DEMO_PASSWORD` if the demo owner has other credentials.
