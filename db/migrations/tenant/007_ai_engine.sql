-- tenant/007_ai_engine.sql
-- Which AI answers this business's chats: our own VoroniX AI or Claude
-- (Claude needs an Anthropic key on the Integrations page).
ALTER TABLE business_settings
  ADD COLUMN ai_engine VARCHAR(10) NOT NULL DEFAULT 'voronix' CHECK (ai_engine IN ('voronix', 'claude'));
