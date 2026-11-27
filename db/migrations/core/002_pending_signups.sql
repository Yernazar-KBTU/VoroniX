-- Sign-up details stay outside businesses/users until the owner proves the
-- address. Passwords are already scrypt hashes; verification tokens are hashed.
CREATE TABLE pending_signups (
  email          VARCHAR(254) PRIMARY KEY CHECK (email = lower(email)),
  business_name VARCHAR(80) NOT NULL,
  business_type VARCHAR(60),
  full_name     VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  country       CHAR(2),
  timezone      VARCHAR(64) NOT NULL,
  currency      CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  token_hash    CHAR(64) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX pending_signups_expires_idx ON pending_signups (expires_at);
