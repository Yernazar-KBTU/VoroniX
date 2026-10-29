# Scrum

Scrum master: Nurzhanov Amirkhan. Sprint length: one course week. Every sprint ends with a review where the increment is shown and checked against the Definition of Done.

## Definition of Done

- The feature works in the web CRM and in the demo site.
- There is at least one automated test for it, and `npm test` passes.
- CI on GitHub is green after the push.
- The database refuses wrong data for it by itself (constraint, key or trigger), not only the web form.
- The docs (`README.md`, `docs/`) say how it works.

## Sprints

| Sprint | Course task | Goal | Increment | How it was checked |
|---|---|---|---|---|
| 1 | Lab 04 | Requirements | FR-01..03, NFR-01 (reply in 5 s), NFR-02 (95% correct), BR-01 (no invented prices) | Review with the team: each requirement has a test idea |
| 2 | Task 5 | Infrastructure | Server, NAS backup, network plan, TCO | Data path drawn end to end; failure plan "manual mode" |
| 3 | Task 6 | Security | Backup decision, MFA, firewall rules | Peer attack on each member's module |
| 4 | Task 7 | Data quality | Appointments dataset, problems P1..P6, data owner | Each member found and explained one problem |
| 5 | Task 9 | Database and working product | 14 tables, ERD, AI administrator, web CRM, integrations | 122 automated tests, load test, CI green |

## Sprint 5 backlog (Task 9)

| Story | Owner | Done when | Test |
|---|---|---|---|
| A client books a service by writing in a messenger | Yernazar | AI answers, books and sends a payment link | `ai-flow.test.ts` (5 tests) |
| The tables store clients, visits and payments safely | Kamila | 14 tables with PK and FK, migrations run in order | `database.test.ts` > schema |
| The AI learns business notes in free text | Kamila | Notes become knowledge entries and settings | `teach.test.ts`, `ai-flow.test.ts` > Teach the AI |
| Task 7 problems cannot come back | Alua | P1..P6 refused or shown to the administrator | `database.test.ts` > data quality, checks |
| The CRM connects to Telegram, WhatsApp, Claude, calendar, webhooks | Inzhu | Connect, Test and Disconnect work, secrets hidden | `integrations.test.ts` (11 tests) |
| Everyone sees the logic of the demo | Akbota | Demo logic table and diagrams in `docs/` | used as the test plan |
| Every story is checked automatically | Amirkhan | 122 tests pass, load test 0 errors, CI green | `npm test`, `npm run test:load` |

## Retrospective (sprint 5)

- Good: the demo logic table made it clear what to build and what to test.
- Problem: tests found a bug in payment insert (`inconsistent types deduced for parameter $5`). Fixed with a `::text` cast.
- Problem: the API test closed a visit that had not happened yet. This is Task 7 problem P6, so a database trigger now refuses it.
- Problem: after the switch to the Barberista demo the load test still asked for the old salon service `MN-02`, and the webhook scenario had no channel secret: 17 058 and 18 097 failed requests. Both fixed in `tests/load/run.mjs`, the next run had 0 errors.
- Next: deploy the API to a server, connect the real Telegram bot, encrypt integration tokens.
