-- core/001_accounts.sql
-- Shared tables in the public schema: the businesses that signed up, their
-- users, sign-in sessions and password reset links. The CRM data of each
-- business lives in its own schema (business_schema below), built from
-- db/migrations/tenant, so one business can never read another one's rows.
-- Session and reset tables store only a SHA-256 hash of the token, so a
-- database leak does not leak logins.

-- Needed by the double-booking constraint in every business schema.
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA public;

CREATE TABLE businesses (
  business_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_schema TEXT         GENERATED ALWAYS AS ('t_' || replace(business_id::text, '-', '')) STORED,
  name            VARCHAR(80)  NOT NULL CHECK (length(trim(name)) > 0),
  country         CHAR(2),
  timezone        VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  currency        CHAR(3)      NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID         NOT NULL REFERENCES businesses (business_id) ON DELETE CASCADE,
  email             VARCHAR(254) NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  full_name         VARCHAR(80)  NOT NULL,
  -- NULL for people who only sign in with Google.
  password_hash     TEXT,
  google_sub        VARCHAR(255) UNIQUE,
  -- Set when the person proved they own the address: a reset link or Google.
  email_verified_at TIMESTAMPTZ,
  role              VARCHAR(10)  NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login_at     TIMESTAMPTZ,
  UNIQUE (email),
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
);
CREATE INDEX users_business_idx ON users (business_id);

CREATE TABLE sessions (
  token_hash  CHAR(64)     PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ  NOT NULL,
  user_agent  VARCHAR(200) NOT NULL DEFAULT '',
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One-time "set a new password" links sent by email. A link works once and
-- for one hour.
CREATE TABLE password_resets (
  token_hash  CHAR(64)     PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- Role of the read-only SQL console. The migrator grants it SELECT inside
-- each business schema. Managed databases that refuse CREATE ROLE simply
-- run without the console.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_readonly') THEN
    CREATE ROLE crm_readonly NOLOGIN;
  END IF;
  EXECUTE format('GRANT crm_readonly TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'crm_readonly was not created, the SQL console stays off';
END
$$;
