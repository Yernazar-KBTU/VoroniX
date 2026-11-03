-- tenant/006_reminders.sql
-- Visit reminders. The AI tells clients "we will remind you a day before",
-- so the server sends a reminder 24 hours and 2 hours before each visit.
-- One row per appointment and kind makes every reminder go out at most once.

CREATE TABLE appointment_reminders (
  appointment_id  VARCHAR(12)  NOT NULL REFERENCES appointments (appointment_id) ON DELETE CASCADE,
  kind            VARCHAR(3)  NOT NULL CHECK (kind IN ('24h', '2h')),
  conversation_id VARCHAR(12)  REFERENCES conversations (conversation_id) ON DELETE SET NULL,
  outcome         VARCHAR(10) NOT NULL CHECK (outcome IN ('sent', 'skipped')),
  note            TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, kind)
);
