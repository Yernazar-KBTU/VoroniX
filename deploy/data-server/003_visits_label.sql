-- VoroniX AI learned a new intent, "visits" (a client asks about their own
-- bookings). The data server's phrase table only allowed the first ten labels.
-- Added to the data server's tenant migrations by docker-compose.yml.
ALTER TABLE ai_phrases DROP CONSTRAINT IF EXISTS ai_phrases_labels_check;
ALTER TABLE ai_phrases ADD CONSTRAINT ai_phrases_labels_check CHECK (
  cardinality(labels) >= 1 AND
  labels <@ ARRAY['greeting','price','booking','cancel','complaint','address','hours','confirm','thanks','visits','other']::text[]);
