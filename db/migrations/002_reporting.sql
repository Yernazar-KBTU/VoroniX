-- 002_reporting.sql
-- Reporting views and a read-only role for the SQL console in the web app.

-- Task 9 query as a view: no-show rate per service over finished visits.
CREATE VIEW v_no_show_by_service AS
SELECT s.service_code,
       s.name                                                        AS service,
       date_trunc('month', a.start_at)::date                         AS month,
       COUNT(*)                                                      AS finished_visits,
       COUNT(*) FILTER (WHERE a.status = 'No-show')                  AS no_shows,
       ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'No-show') / COUNT(*), 1) AS no_show_pct,
       COUNT(*) FILTER (WHERE a.status = 'No-show') * s.price_kzt    AS lost_revenue_kzt
FROM appointments a
JOIN services s ON s.service_code = a.service_code
WHERE a.status IN ('Completed', 'No-show')
GROUP BY s.service_code, s.name, s.price_kzt, date_trunc('month', a.start_at);

-- Revenue per day from completed visits.
CREATE VIEW v_daily_revenue AS
SELECT a.start_at::date AS day,
       COUNT(*)         AS completed_visits,
       SUM(s.price_kzt) AS revenue_kzt
FROM appointments a
JOIN services s ON s.service_code = a.service_code
WHERE a.status = 'Completed'
GROUP BY a.start_at::date;

-- Role used by the SQL console. The API switches to it with SET LOCAL ROLE
-- inside a READ ONLY transaction, so console queries can never change data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_readonly') THEN
    CREATE ROLE crm_readonly NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO crm_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_readonly;
REVOKE SELECT ON master_accounts FROM crm_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO crm_readonly;
DO $$
BEGIN
  EXECUTE format('GRANT crm_readonly TO %I', current_user);
END
$$;
