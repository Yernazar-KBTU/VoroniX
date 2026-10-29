# Testing

`npm test` runs 119 tests with vitest. Integration tests drop and recreate the `crm_test` schema, run the migrations and load the demo data, so every run starts from the same state.

| File | Tests | What it proves |
|---|---|---|
| unit/scheduling.test.ts | 9 | free slots respect working hours, other visits, days off, the past and visits after midnight |
| unit/pricing.test.ts | 5 | 30% prepayment from 20 000 ₸ |
| unit/offline-nlu.test.ts | 35 | salon and barbershop services, days, times, phones and names in Russian and English; complaints |
| integration/database.test.ts | 18 | every constraint refuses bad data; 8 concurrent bookings → 1 saved |
| integration/api.test.ts | 24 | booking, 409/400 errors, payment transaction, idempotent payment, read-only SQL |
| unit/teach.test.ts | 5 | free notes → promotion, rule, FAQ entries; slogan and hours go to settings; promotion found for a service |
| integration/ai-flow.test.ts | 12 | webhook → reply → client card → booking → payment link → Paid; complaint → human; NFR-01; taught promotion and brand phrase appear in the next reply |
| integration/integrations.test.ts | 11 | Telegram and Claude tokens checked and never returned; secrets hidden from the SQL console; WhatsApp webhook secret; iCal feed; outgoing webhook on a new booking |

A bug found by the tests: inserting a payment failed with `inconsistent types deduced for parameter $5`, because the same parameter was used as a column value and in a `CASE`. Fixed with an explicit `::text` cast.

## Load test

`tests/load/run.mjs` (autocannon), 8 s per scenario, single Node process. Result in `reports/load-test.json`: 0 errors in all 7 scenarios; 526 AI replies under load had p95 380 ms, 100% within 5 s.
