-- tenant/002_reporting.sql
-- Reporting views. The read-only SQL console gets SELECT on them through
-- the crm_readonly role, granted per business schema by the migrator.

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
