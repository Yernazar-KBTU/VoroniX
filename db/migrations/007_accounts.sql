-- 007_accounts.sql
-- Accounts: every business that signs up gets its own row, its owner gets a
-- user, and a browser keeps a session. The session table stores only a
-- SHA-256 hash of the cookie token, so a database leak does not leak logins.

CREATE TABLE businesses (
  business_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80)  NOT NULL CHECK (length(trim(name)) > 0),
  country     CHAR(2),
  timezone    VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  currency    CHAR(3)      NOT NULL DEFAULT 'USD',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID         NOT NULL REFERENCES businesses (business_id) ON DELETE CASCADE,
  email         VARCHAR(254) NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  full_name     VARCHAR(80)  NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (email)
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
