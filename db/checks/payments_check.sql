\set ON_ERROR_STOP off
BEGIN;
SELECT set_config('search_path', format('%I, public', :'schema'), true);

\echo '=== R1-R6: refund workflow on one Paid payment ==='
DO $$
DECLARE
  pid  TEXT;
  amt  INTEGER;
  st   TEXT;
BEGIN
  SELECT payment_id, amount_kzt::int INTO pid, amt FROM payments WHERE status = 'Paid' AND amount_kzt >= 2 LIMIT 1;
  IF pid IS NULL THEN RAISE NOTICE 'SKIP: no Paid payment in demo data'; RETURN; END IF;

  -- R1: a partial refund is allowed, the payment stays Paid
  INSERT INTO payment_refunds (payment_id, amount_kzt, reason, refunded_by) VALUES (pid, 1, 'check', 'check');
  SELECT status INTO st FROM payments WHERE payment_id = pid;
  IF st = 'Paid' THEN RAISE NOTICE 'OK R1: partial refund of 1 KZT, payment stays Paid';
  ELSE RAISE NOTICE 'FAIL R1: status is % after a partial refund', st; END IF;

  -- R2: more than what is left is refused
  BEGIN
    INSERT INTO payment_refunds (payment_id, amount_kzt, reason, refunded_by) VALUES (pid, amt, 'too much', 'check');
    RAISE NOTICE 'FAIL R2: refund above the paid amount was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK R2: refused -> %', SQLERRM;
  END;

  -- R3: the rest of the money closes the payment as Refunded
  INSERT INTO payment_refunds (payment_id, amount_kzt, reason, refunded_by) VALUES (pid, amt - 1, 'check rest', 'check');
  SELECT status INTO st FROM payments WHERE payment_id = pid;
  IF st = 'Refunded' THEN RAISE NOTICE 'OK R3: refunds add up to the whole amount, payment became Refunded';
  ELSE RAISE NOTICE 'FAIL R3: status is % after full refund', st; END IF;

  -- R4: a refunded payment cannot be refunded again
  BEGIN
    INSERT INTO payment_refunds (payment_id, amount_kzt, reason, refunded_by) VALUES (pid, 1, 'again', 'check');
    RAISE NOTICE 'FAIL R4: a Refunded payment was refunded again';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK R4: refused -> %', SQLERRM;
  END;

  -- R5: refund records cannot be edited or deleted
  BEGIN
    UPDATE payment_refunds SET reason = 'edited' WHERE payment_id = pid;
    RAISE NOTICE 'FAIL R5: refund record was edited';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK R5: UPDATE refused -> %', SQLERRM;
  END;

  -- R6: Refunded is final
  BEGIN
    UPDATE payments SET status = 'Paid' WHERE payment_id = pid;
    RAISE NOTICE 'FAIL R6: Refunded payment went back to Paid';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK R6: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== R7: a Pending payment cannot be refunded as money ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments WHERE status = 'Pending' LIMIT 1;
  IF pid IS NULL THEN RAISE NOTICE 'SKIP: no Pending payment in demo data'; RETURN; END IF;
  BEGIN
    INSERT INTO payment_refunds (payment_id, amount_kzt, reason, refunded_by) VALUES (pid, 1, 'check', 'check');
    RAISE NOTICE 'FAIL R7: refund of an unpaid payment was accepted';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK R7: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== R8: a Paid payment cannot be set to Refunded without refund records ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments WHERE status = 'Paid' LIMIT 1;
  IF pid IS NULL THEN RAISE NOTICE 'SKIP: no Paid payment in demo data'; RETURN; END IF;
  BEGIN
    UPDATE payments SET status = 'Refunded' WHERE payment_id = pid;
    RAISE NOTICE 'FAIL R8: status was changed to Refunded by hand';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK R8: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== I1: the same idempotency key cannot be stored twice ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments LIMIT 1;
  INSERT INTO payment_requests (idempotency_key, operation, payment_id, request_hash, response)
  VALUES ('11111111-1111-1111-1111-111111111111', 'pay', pid, repeat('a', 64), '{}'::jsonb);
  BEGIN
    INSERT INTO payment_requests (idempotency_key, operation, payment_id, request_hash, response)
    VALUES ('11111111-1111-1111-1111-111111111111', 'pay', pid, repeat('b', 64), '{}'::jsonb);
    RAISE NOTICE 'FAIL I1: duplicate key was stored';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK I1: duplicate key refused';
  END;
END $$;

\echo '=== E1: the same webhook event id cannot be stored twice ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments LIMIT 1;
  INSERT INTO payment_events (event_id, event_type, payment_id) VALUES ('evt_check_0001', 'payment.succeeded', pid);
  BEGIN
    INSERT INTO payment_events (event_id, event_type, payment_id) VALUES ('evt_check_0001', 'payment.succeeded', pid);
    RAISE NOTICE 'FAIL E1: duplicate event was stored';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK E1: duplicate event refused (replay protection)';
  END;
END $$;

ROLLBACK;
\echo '=== done: ROLLBACK, demo data unchanged ==='
