-- tenant/008_ai_engine_voronixai.sql
-- A third AI for the chats: VoroniX.ai (its own server, set by VORONIXAI_URL).
ALTER TABLE business_settings DROP CONSTRAINT IF EXISTS business_settings_ai_engine_check;
ALTER TABLE business_settings
  ADD CONSTRAINT business_settings_ai_engine_check CHECK (ai_engine IN ('voronix', 'claude', 'voronixai'));
