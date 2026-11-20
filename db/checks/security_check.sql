\set ON_ERROR_STOP off
BEGIN;
SELECT set_config('search_path', format('%I, public', :'schema'), true);

\echo '=== T1: changing a client writes a row to audit_log ==='
UPDATE clients SET notes = coalesce(notes, '') || ' [audit test]' WHERE client_id = 'CL-0001';
SELECT table_name, record_id, action, db_user, changed_at
FROM audit_log
WHERE table_name = 'clients' AND record_id = 'CL-0001'
ORDER BY audit_id DESC
LIMIT 1;

\echo '=== T2: amount of a Paid payment cannot be changed ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments WHERE status = 'Paid' LIMIT 1;
  IF pid IS NULL THEN RAISE NOTICE 'SKIP: no Paid payment in demo data'; RETURN; END IF;
  BEGIN
    UPDATE payments SET amount_kzt = amount_kzt + 1 WHERE payment_id = pid;
    RAISE NOTICE 'FAIL: amount of Paid payment % was changed', pid;
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== T3: a Paid payment cannot be deleted ==='
DO $$
DECLARE pid TEXT;
BEGIN
  SELECT payment_id INTO pid FROM payments WHERE status = 'Paid' LIMIT 1;
  IF pid IS NULL THEN RAISE NOTICE 'SKIP: no Paid payment in demo data'; RETURN; END IF;
  BEGIN
    DELETE FROM payments WHERE payment_id = pid;
    RAISE NOTICE 'FAIL: Paid payment % was deleted', pid;
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'OK: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== T4: a wrong phone format is refused ==='
DO $$
BEGIN
  BEGIN
    UPDATE clients SET phone = 'not-a-phone' WHERE client_id = 'CL-0001';
    RAISE NOTICE 'FAIL: wrong phone was saved';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: refused -> %', SQLERRM;
  END;
END $$;

\echo '=== T5: audit_log is append-only (UPDATE and DELETE are refused) ==='
DO $$
BEGIN
  BEGIN
    UPDATE audit_log SET action = 'DELETE' WHERE audit_id = (SELECT max(audit_id) FROM audit_log);
    RAISE NOTICE 'FAIL: audit row was changed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: UPDATE refused -> %', SQLERRM;
  END;
  BEGIN
    DELETE FROM audit_log WHERE audit_id = (SELECT max(audit_id) FROM audit_log);
    RAISE NOTICE 'FAIL: audit row was deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: DELETE refused -> %', SQLERRM;
  END;
END $$;

\echo '=== T6: report role crm_readonly cannot read audit_log ==='
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_readonly') THEN
    RAISE NOTICE 'SKIP: role crm_readonly does not exist'; RETURN;
  END IF;
  BEGIN
    SET LOCAL ROLE crm_readonly;
    PERFORM count(*) FROM audit_log;
    RAISE NOTICE 'FAIL: crm_readonly can read audit_log';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: permission denied for audit_log';
  END;
END $$;

ROLLBACK;
\echo '=== done: ROLLBACK, demo data unchanged ==='