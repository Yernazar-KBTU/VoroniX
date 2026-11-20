-- 1. Refunds
CREATE TABLE IF NOT EXISTS payment_refunds (
  refund_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id  TEXT        NOT NULL REFERENCES payments (payment_id),
  amount_kzt  INTEGER     NOT NULL CHECK (amount_kzt > 0),
  reason      TEXT        NOT NULL CHECK (length(trim(reason)) > 0),
  -- id of the user who did it (not the e-mail: the report role can read this table)
  refunded_by TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx ON payment_refunds (payment_id);

-- BEFORE INSERT: lock the payment row, so two refunds of the same payment can never
-- run at the same time, then check the rules.
CREATE OR REPLACE FUNCTION payment_refunds_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p       payments%ROWTYPE;
  already NUMERIC;
BEGIN
  SELECT * INTO p FROM payments WHERE payment_id = NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', NEW.payment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p.status <> 'Paid' THEN
    RAISE EXCEPTION 'Only a Paid payment can be refunded (payment % is %)', p.payment_id, p.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT COALESCE(SUM(amount_kzt), 0) INTO already FROM payment_refunds WHERE payment_id = NEW.payment_id;
  IF already + NEW.amount_kzt > p.amount_kzt THEN
    RAISE EXCEPTION 'Refunds (% already + % now) would be more than the paid amount %', already, NEW.amount_kzt, p.amount_kzt
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_refunds_guard ON payment_refunds;
CREATE TRIGGER trg_payment_refunds_guard
  BEFORE INSERT ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION payment_refunds_guard();

-- AFTER INSERT: when the refunds add up to the whole amount, the payment becomes Refunded.
CREATE OR REPLACE FUNCTION payment_refunds_close() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid  NUMERIC;
  total NUMERIC;
BEGIN
  SELECT amount_kzt INTO paid FROM payments WHERE payment_id = NEW.payment_id;
  SELECT SUM(amount_kzt) INTO total FROM payment_refunds WHERE payment_id = NEW.payment_id;
  IF total = paid THEN
    UPDATE payments SET status = 'Refunded' WHERE payment_id = NEW.payment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_refunds_close ON payment_refunds;
CREATE TRIGGER trg_payment_refunds_close
  AFTER INSERT ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION payment_refunds_close();

-- A refund record is a financial fact: no edit, no delete.
CREATE OR REPLACE FUNCTION payment_refunds_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment_refunds is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_refunds_immutable ON payment_refunds;
CREATE TRIGGER trg_payment_refunds_immutable
  BEFORE UPDATE OR DELETE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION payment_refunds_immutable();

-- Every refund also goes to the audit log from migration 008.
DROP TRIGGER IF EXISTS trg_audit_payment_refunds ON payment_refunds;
CREATE TRIGGER trg_audit_payment_refunds
  AFTER INSERT OR UPDATE OR DELETE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('refund_id');

-- 2. Idempotency keys
CREATE TABLE IF NOT EXISTS payment_requests (
  idempotency_key UUID        PRIMARY KEY,
  operation       TEXT        NOT NULL CHECK (operation IN ('pay', 'refund')),
  payment_id      TEXT        NOT NULL REFERENCES payments (payment_id),
  -- SHA-256 of what the first request asked for
  request_hash    CHAR(64)    NOT NULL,
  response        JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_requests_payment_idx ON payment_requests (payment_id);

-- 3. Webhook events already processed
CREATE TABLE IF NOT EXISTS payment_events (
  event_id    TEXT        PRIMARY KEY CHECK (length(event_id) BETWEEN 8 AND 100),
  event_type  TEXT        NOT NULL,
  payment_id  TEXT        NOT NULL REFERENCES payments (payment_id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Payment guard v2 (replaces the function from migration 008)
CREATE OR REPLACE FUNCTION payments_protect_paid() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  refunded NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'Paid' THEN
      RAISE EXCEPTION 'Payment % is Paid and cannot be deleted (refund it instead)', OLD.payment_id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'Refunded' AND NEW.status <> 'Refunded' THEN
    RAISE EXCEPTION 'Payment % was refunded: this is final', OLD.payment_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status = 'Paid'
     AND (NEW.amount_kzt IS DISTINCT FROM OLD.amount_kzt
          OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id) THEN
    RAISE EXCEPTION 'Payment % is Paid: amount and visit cannot be changed', OLD.payment_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- A Paid payment becomes Refunded only when refund records cover the whole amount.
  IF OLD.status = 'Paid' AND NEW.status = 'Refunded' THEN
    SELECT COALESCE(SUM(amount_kzt), 0) INTO refunded FROM payment_refunds WHERE payment_id = OLD.payment_id;
    IF refunded < OLD.amount_kzt THEN
      RAISE EXCEPTION 'Payment % cannot become Refunded: refund records cover only % of %', OLD.payment_id, refunded, OLD.amount_kzt
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;