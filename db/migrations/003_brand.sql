-- 003_brand.sql
-- Brand phrase the AI uses in greetings and booking confirmations.
ALTER TABLE business_settings
  ADD COLUMN catchphrase VARCHAR(200) NOT NULL DEFAULT '';
