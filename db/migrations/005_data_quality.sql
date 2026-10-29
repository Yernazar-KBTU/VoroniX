-- 005_data_quality.sql
-- Closes the last two data quality problems found in the Task 7 audit.

-- P6: a visit cannot be "Completed" or "No-show" before it has started.
CREATE FUNCTION appointments_result_after_visit() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('Completed', 'No-show') AND NEW.start_at > (now() AT TIME ZONE 'Asia/Almaty') THEN
    RAISE EXCEPTION 'Visit % has not started yet, so it cannot be %', NEW.appointment_id, NEW.status
      USING ERRCODE = '23514', CONSTRAINT = 'appointments_result_after_visit';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_result_after_visit
  BEFORE INSERT OR UPDATE OF status, start_at ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_result_after_visit();

-- P5: past visits that are still "Booked" or "Confirmed". The dashboard shows
-- them under "Needs attention" with Completed / No-show buttons.
CREATE VIEW v_visits_to_close AS
SELECT a.appointment_id,
       a.start_at,
       c.display_name AS client,
       s.name         AS service,
       m.full_name    AS master,
       a.status,
       floor(extract(epoch FROM (now() AT TIME ZONE 'Asia/Almaty') - a.end_at) / 3600)::int AS hours_overdue
FROM appointments a
JOIN clients  c ON c.client_id = a.client_id
JOIN services s ON s.service_code = a.service_code
JOIN masters  m ON m.master_id = a.master_id
WHERE a.status IN ('Booked', 'Confirmed')
  AND a.end_at < (now() AT TIME ZONE 'Asia/Almaty');

GRANT SELECT ON v_visits_to_close TO crm_readonly;
