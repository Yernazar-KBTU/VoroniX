# Team and code ownership

Basics of Information Systems, Fall 2026. Every member owns a part of the system and knows where it lives in the code.

| Member | Role | Owns in the repository |
|---|---|---|
| Altynbekov Yernazar | Development lead | `apps/api/src/app.ts`, `server.ts`, `ai/` (engine, tools, runner), `services/`, `routes/`, `apps/web/src/` |
| Balabatyr Kamila | Database and AI knowledge | `db/migrations/001_init.sql`, `002_reporting.sql`, `003_brand.sql`, `apps/api/src/repositories/`, `db/seed.ts`, `ai/teach.ts`, `ai/context.ts`, `pages/knowledge.js` |
| Nurzhanov Amirkhan | QA and Scrum master | `apps/api/test/`, `tests/load/run.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml`, `reports/`, `docs/testing.md`, `docs/scrum.md` |
| Ussenbayeva Alua | Data quality and keys | primary keys and sequences in `001_init.sql`, `005_data_quality.sql`, `lib/errors.ts`, `routes/schemas.ts`, "Needs attention" on the dashboard |
| Aitakhyn Inzhu | System integration | `integrations/catalog.ts`, `integrations/manager.ts`, `routes/integrations.routes.ts`, `channels/telegram.ts`, `realtime/bus.ts`, `004_integrations.sql`, `pages/integrations.js` |
| Askarova Akbota | System design and visuals | `docs/demo-logic.md`, `docs/architecture.md`, `docs/images/erd.png`, `docs/images/pipeline.png`, `site/` (demo version) |

## How the parts depend on each other

1. Akbota's demo logic table (`docs/demo-logic.md`) lists every step a client and an administrator take in the demo.
2. Yernazar builds each step as a route, a service and an AI tool.
3. Kamila gives each step its tables and the queries in `repositories/`.
4. Alua adds the rule that stops bad data for that step and the readable error.
5. Inzhu connects the step to the outside world: messengers, payments, calendar, webhooks.
6. Amirkhan turns the "Checked by" column of the same table into a test and keeps CI green.
