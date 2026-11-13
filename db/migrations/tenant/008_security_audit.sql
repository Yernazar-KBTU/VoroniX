--Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN('INSERT', 'UPDATE', 'DELETE')),
    old_row JSONB,
    new_row JSONB,
    db_user TEXT NOT NULL DEFAULT current_user,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_record_idx
    ON audit_log (table_name, record_id, changed_at DESC);

-- No SECURITY DEFINER and no fixed search_path: the function is created inside the
-- business schema and finds audit_log through the connection's search_path.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    pk_col TEXT := TG_ARGV[0];
    rec JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        rec := to_jsonb(OLD);
    ELSE
        rec := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_log (table_name, record_id, action, old_row, new_row)
    VALUES (
        TG_TABLE_NAME,
        rec ->> pk_col,
        TG_OP,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    );
    RETURN NULL; --after trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_clients ON clients;
CREATE TRIGGER trg_audit_clients
    AFTER INSERT OR UPDATE OR DELETE ON clients
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('client_id');

DROP TRIGGER IF EXISTS trg_audit_appointments ON appointments;
CREATE TRIGGER trg_audit_appointments
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('appointment_id');

DROP TRIGGER IF EXISTS trg_audit_payments ON payments;
CREATE TRIGGER trg_audit_payments
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('payment_id');

--The log is append-only and hidden from the report role
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
REVOKE ALL ON audit_log FROM PUBLIC;

DO $$
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_readonly') THEN
        REVOKE ALL ON audit_log FROM crm_readonly;
    END IF;
END
$$;

--A paid payment is a financial record: no delete, no change of amount
CREATE OR REPLACE FUNCTION payments_protect_paid() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'Paid' THEN
            RAISE EXCEPTION 'Payment % is Paid and cannot be deleted (refund it instead)', OLD.payment_id
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

--update
    IF OLD.status = 'Paid'
        AND (NEW.amount_kzt IS DISTINCT FROM OLD.amount_kzt OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id) THEN
        RAISE EXCEPTION 'Payment % is Paid: amount and visit cannot be changed', OLD.payment_id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_protect_paid ON payments;
CREATE TRIGGER trg_payments_protect_paid
    BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION payments_protect_paid();

--
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'clients_phone_format' AND conrelid = 'clients'::regclass) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_phone_format
            CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{7,20}$') NOT VALID;
    END IF;
END
$$;