# VoroniX: database security architecture

Owner: Alua Ussenbayeva (architecture & security, database Scrum master)

## 1. Defence in depth: the path of one client message

```
Client (Telegram / WhatsApp / Instagram)
   |  1. webhook secret: a request without the secret is refused
   v
API (Node.js + TypeScript)
   |  2. validation of input (dates, ids), error mapping (lib/errors.ts)
   v
AI administrator
   |  3. 8 fixed tools, never SQL; same booking service as the admin screen
   v
PostgreSQL
   |  4. roles: crm_readonly (no master_accounts, integrations, audit_log)
   |  5. constraints: PK, FK, NOT NULL, CHECK, EXCLUDE, triggers
   |  6. audit_log: every change of clients, appointments, payments
   v
Backup / secrets
      7. integration tokens encrypted by the app, keys rotated (Amirkhan)
```

If one layer fails, the next one still protects the data. This is the main
architecture idea: security is not one wall but seven.

## 2. Threats and controls

| # | Threat | Control | Where | Status |
|---|--------|---------|-------|--------|
| T1 | Someone edits a payment after it is Paid | trigger `payments_protect_paid` | tenant/008_security_audit.sql | done |
| T2 | Nobody knows who changed a visit or a payment | `audit_log` + triggers | tenant/008_security_audit.sql | done |
| T3 | An insider deletes the audit trail | append-only trigger, no access for report role | tenant/008_security_audit.sql | done |
| T4 | A report user changes or reads secrets | role `crm_readonly`, READ ONLY transaction, 3 s timeout | Task 9 | done |
| T5 | The AI is tricked into showing other clients' data | AI uses fixed tools, not SQL | Task 9 | done |
| T6 | Garbage phone numbers break matching of clients | `clients_phone_format` CHECK | tenant/008_security_audit.sql | done |
| T7 | Tokens read from a database backup | application-level encryption with key rotation (INTEGRATION_ENCRYPTION_KEYS) | Amirkhan | done (his part) |
| T8 | Secrets or IDE files committed to the public repository | `.gitignore`, secret scan of history | repo | to do |
| T9 | One shared login for all barbers | separate login per barber, least privilege | next sprint | planned |
| T10 | Report role reads audit_log (phones of clients) through the blanket `GRANT SELECT ON ALL TABLES` | `audit_log` added to the REVOKE list in `migrate.ts`; test T6 in security_check.sql | migrate.ts, security_check.sql | done (found by T6) |
| T11 | SQL console or demo reset left on in production | `SQL_CONSOLE` and `ALLOW_DEMO_RESET` are off by default in production | .env.example | done (configuration) |

## 3. Decisions and why

- **master_accounts and integrations are not audited.** The audit row would copy
  `password_hash` and tokens into another table and create a second secret store.
- **One audit_log per business schema.** The migration runs in every `t_<id>` schema,
  so audit rows of one business can never mix with another business (ADR-7).
- **Phone is optional, but its format is checked.** Instagram gives no phone, so
  NOT NULL would block real clients; a format rule still stops garbage.
- **Paid payments are refunded, not deleted.** Money history must stay complete.

## 4. How to verify

```
psql "$DATABASE_URL" -f db/checks/security_check.sql
```

Six tests print OK/FAIL; the script ends with ROLLBACK, demo data stays unchanged.
