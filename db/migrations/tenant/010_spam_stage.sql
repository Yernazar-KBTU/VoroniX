-- Adds the "Spam" stage to the sales funnel: off-topic and spam chats are moved there instead of being deleted.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_stage_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_stage_check
  CHECK (stage IN ('New', 'In dialog', 'Booked', 'Paid', 'Visited', 'Lost', 'Spam'));
