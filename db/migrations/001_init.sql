-- 001_init.sql
-- Core schema of the CRM. Times of visits are stored as local salon time
-- (TIMESTAMP without time zone); audit times are TIMESTAMPTZ.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Business profile: one row. The AI reads it on every reply.
-- ---------------------------------------------------------------------------
CREATE TABLE business_settings (
  id                   SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name                 VARCHAR(80)  NOT NULL,
  business_type        VARCHAR(60)  NOT NULL DEFAULT 'Beauty salon',
  city                 VARCHAR(60)  NOT NULL DEFAULT '',
  address              VARCHAR(160) NOT NULL DEFAULT '',
  hours                VARCHAR(120) NOT NULL DEFAULT '',
  phone                VARCHAR(40)  NOT NULL DEFAULT '',
  tone                 TEXT         NOT NULL DEFAULT '',
  languages            VARCHAR(120) NOT NULL DEFAULT '',
  staff_label          VARCHAR(30)  NOT NULL DEFAULT 'Master',
  service_label        VARCHAR(30)  NOT NULL DEFAULT 'Service',
  prepay_percent       SMALLINT     NOT NULL DEFAULT 30 CHECK (prepay_percent BETWEEN 0 AND 100),
  prepay_min_price_kzt INTEGER      NOT NULL DEFAULT 20000 CHECK (prepay_min_price_kzt >= 0),
  autopilot            BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Clients and their messenger accounts (1:M). One person can write from
-- Telegram and WhatsApp; both channels point to the same card (Task 7, P3).
-- ---------------------------------------------------------------------------
CREATE SEQUENCE clients_seq;
CREATE TABLE clients (
  client_id    VARCHAR(7)  PRIMARY KEY DEFAULT 'CL-' || lpad(nextval('clients_seq')::text, 4, '0')
               CHECK (client_id ~ '^CL-[0-9]{4}$'),
  display_name VARCHAR(50) NOT NULL CHECK (length(btrim(display_name)) > 0),
  phone        VARCHAR(20) UNIQUE,
  notes        TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE client_channels_seq;
CREATE TABLE client_channels (
  channel_id       VARCHAR(7)  PRIMARY KEY DEFAULT 'CH-' || lpad(nextval('client_channels_seq')::text, 4, '0'),
  client_id        VARCHAR(7)  NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
  messenger        VARCHAR(10) NOT NULL CHECK (messenger IN ('Telegram', 'WhatsApp', 'Instagram')),
  external_user_id VARCHAR(64) NOT NULL,
  UNIQUE (messenger, external_user_id)
);
CREATE INDEX client_channels_client_idx ON client_channels (client_id);

-- ---------------------------------------------------------------------------
-- Catalogue: services and masters, linked M:N through master_services.
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  service_code CHAR(5)     PRIMARY KEY CHECK (service_code ~ '^[A-Z]{2}-[0-9]{2}$'),
  name         VARCHAR(50) NOT NULL UNIQUE,
  category     VARCHAR(30) NOT NULL DEFAULT '',
  duration_min INTEGER     NOT NULL CHECK (duration_min BETWEEN 15 AND 240),
  price_kzt    INTEGER     NOT NULL CHECK (price_kzt > 0),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE SEQUENCE masters_seq;
CREATE TABLE masters (
  master_id      VARCHAR(5)  PRIMARY KEY DEFAULT 'MS-' || lpad(nextval('masters_seq')::text, 2, '0')
                 CHECK (master_id ~ '^MS-[0-9]{2}$'),
  full_name      VARCHAR(60) NOT NULL CHECK (length(btrim(full_name)) > 0),
  specialization VARCHAR(40) NOT NULL DEFAULT '',
  work_start     TIME        NOT NULL DEFAULT '09:00',
  work_end       TIME        NOT NULL DEFAULT '20:00',
  work_days      SMALLINT[]  NOT NULL DEFAULT '{1,2,3,4,5,6}'
                 CHECK (work_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  CHECK (work_end > work_start)
);

-- Bridge table for the M:N relation. Rows are deactivated, not deleted, so
-- old appointments keep a valid (master, service) pair.
CREATE TABLE master_services (
  master_id    VARCHAR(5)  NOT NULL REFERENCES masters (master_id) ON DELETE CASCADE,
  service_code CHAR(5)     NOT NULL REFERENCES services (service_code) ON DELETE CASCADE,
  skill_level  VARCHAR(10) NOT NULL DEFAULT 'Senior' CHECK (skill_level IN ('Junior', 'Senior')),
  since_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (master_id, service_code)
);

-- 1:1 with masters: each master has at most one login.
CREATE TABLE master_accounts (
  account_id    SERIAL       PRIMARY KEY,
  master_id     VARCHAR(5)   NOT NULL UNIQUE REFERENCES masters (master_id) ON DELETE CASCADE,
  login         VARCHAR(30)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  last_login    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Appointments: the main action of the system.
-- * (master_id, service_code) must be a pair from master_services, so a
--   master can only be booked for a service they do.
-- * The exclusion constraint makes double booking of one master impossible
--   at the database level, even if two chats book the same slot at once.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE appointments_seq START 1001;
CREATE TABLE appointments (
  appointment_id VARCHAR(8)  PRIMARY KEY DEFAULT 'AP-' || nextval('appointments_seq')::text,
  client_id      VARCHAR(7)  NOT NULL REFERENCES clients (client_id) ON DELETE RESTRICT,
  master_id      VARCHAR(5)  NOT NULL,
  service_code   CHAR(5)     NOT NULL,
  start_at       TIMESTAMP   NOT NULL,
  end_at         TIMESTAMP   NOT NULL,
  status         VARCHAR(10) NOT NULL DEFAULT 'Booked'
                 CHECK (status IN ('Booked', 'Confirmed', 'Completed', 'Cancelled', 'No-show')),
  source         VARCHAR(10) NOT NULL DEFAULT 'Admin'
                 CHECK (source IN ('Telegram', 'WhatsApp', 'Instagram', 'Admin')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (master_id, service_code) REFERENCES master_services (master_id, service_code),
  CHECK (end_at > start_at),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    master_id WITH =,
    tsrange(start_at, end_at) WITH &&
  ) WHERE (status <> 'Cancelled')
);
CREATE INDEX appointments_client_idx ON appointments (client_id);
CREATE INDEX appointments_start_idx ON appointments (start_at);
CREATE INDEX appointments_service_status_idx ON appointments (service_code, status);

-- ---------------------------------------------------------------------------
-- Payments: one appointment can have a prepayment and a full payment.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE payments_seq;
CREATE TABLE payments (
  payment_id     VARCHAR(8)  PRIMARY KEY DEFAULT 'PM-' || lpad(nextval('payments_seq')::text, 5, '0'),
  appointment_id VARCHAR(8)  NOT NULL REFERENCES appointments (appointment_id) ON DELETE CASCADE,
  amount_kzt     INTEGER     NOT NULL CHECK (amount_kzt > 0),
  kind           VARCHAR(10) NOT NULL CHECK (kind IN ('prepayment', 'full')),
  method         VARCHAR(10) NOT NULL DEFAULT 'Kaspi QR' CHECK (method IN ('Kaspi QR', 'Card', 'Cash')),
  status         VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Refunded')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ,
  CHECK (status = 'Pending' OR paid_at IS NOT NULL)
);
CREATE INDEX payments_appointment_idx ON payments (appointment_id);

-- ---------------------------------------------------------------------------
-- Conversations from messengers. Each chat is also a deal in the funnel.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE conversations_seq;
CREATE TABLE conversations (
  conversation_id  VARCHAR(7)  PRIMARY KEY DEFAULT 'CV-' || lpad(nextval('conversations_seq')::text, 4, '0'),
  messenger        VARCHAR(10) NOT NULL CHECK (messenger IN ('Telegram', 'WhatsApp', 'Instagram')),
  external_user_id VARCHAR(64) NOT NULL,
  contact_name     VARCHAR(60) NOT NULL,
  client_id        VARCHAR(7)  REFERENCES clients (client_id) ON DELETE SET NULL,
  appointment_id   VARCHAR(8)  REFERENCES appointments (appointment_id) ON DELETE SET NULL,
  stage            VARCHAR(10) NOT NULL DEFAULT 'New'
                   CHECK (stage IN ('New', 'In dialog', 'Booked', 'Paid', 'Visited', 'Lost')),
  ai_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  needs_human      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (messenger, external_user_id)
);

CREATE TABLE messages (
  message_id      BIGSERIAL   PRIMARY KEY,
  conversation_id VARCHAR(7)  NOT NULL REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  sender          VARCHAR(6)  NOT NULL CHECK (sender IN ('client', 'ai', 'admin', 'system', 'pay')),
  body            TEXT        NOT NULL DEFAULT '',
  payment_id      VARCHAR(8)  REFERENCES payments (payment_id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (sender <> 'pay' OR payment_id IS NOT NULL)
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, message_id);

-- ---------------------------------------------------------------------------
-- Knowledge base written by the business owner. The AI reads it.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE knowledge_seq;
CREATE TABLE knowledge_entries (
  entry_id   VARCHAR(8)   PRIMARY KEY DEFAULT 'KB-' || nextval('knowledge_seq')::text,
  title      VARCHAR(120) NOT NULL CHECK (length(btrim(title)) > 0),
  category   VARCHAR(40)  NOT NULL DEFAULT 'General',
  content    TEXT         NOT NULL CHECK (length(content) BETWEEN 1 AND 60000),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Log of every AI turn: used to check NFR-01 (reply within 5 s) and to see
-- which CRM actions the AI took.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_runs (
  run_id          BIGSERIAL   PRIMARY KEY,
  conversation_id VARCHAR(7)  REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  engine          VARCHAR(40) NOT NULL,
  latency_ms      INTEGER     NOT NULL CHECK (latency_ms >= 0),
  tool_calls      JSONB       NOT NULL DEFAULT '[]',
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  outcome         VARCHAR(12) NOT NULL CHECK (outcome IN ('replied', 'handoff', 'error', 'cancelled')),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_runs_created_idx ON ai_runs (created_at);

-- Id sequences belong to their columns, so TRUNCATE ... RESTART IDENTITY resets them.
ALTER SEQUENCE clients_seq         OWNED BY clients.client_id;
ALTER SEQUENCE client_channels_seq OWNED BY client_channels.channel_id;
ALTER SEQUENCE masters_seq         OWNED BY masters.master_id;
ALTER SEQUENCE appointments_seq    OWNED BY appointments.appointment_id;
ALTER SEQUENCE payments_seq        OWNED BY payments.payment_id;
ALTER SEQUENCE conversations_seq   OWNED BY conversations.conversation_id;
ALTER SEQUENCE knowledge_seq       OWNED BY knowledge_entries.entry_id;
