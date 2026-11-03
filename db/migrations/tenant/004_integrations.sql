-- tenant/004_integrations.sql
-- Connections to outside services, managed from the Integrations page.
-- secret holds tokens and API keys; the API never returns it in full and the
-- read-only reporting role cannot read the table (the migrator never grants it).
CREATE TABLE integrations (
  provider      VARCHAR(20)  PRIMARY KEY
                CHECK (provider IN ('telegram', 'whatsapp', 'instagram', 'claude', 'kaspi', 'google_calendar', 'webhook')),
  enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
  settings      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  secret        TEXT,
  status        VARCHAR(10)  NOT NULL DEFAULT 'off' CHECK (status IN ('off', 'connected', 'error')),
  status_detail VARCHAR(300) NOT NULL DEFAULT '',
  checked_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
