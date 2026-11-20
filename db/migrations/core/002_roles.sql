-- core/002_roles.sql  (Alua Ussenbayeva: RBAC)
-- Four business roles instead of three. 'staff' stays so that existing users keep working.
--   owner       everything
--   admin       clients, visits, payments (take), knowledge base; no refunds, no settings
--   accountant  payments (read, refund) and reports; no clients, no visits
--   master      only the visits of his own barber card (users.master_id)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'accountant', 'master', 'staff'));

-- The barber card (masters.master_id in the business schema, e.g. 'MS-01') this login belongs to.
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id VARCHAR(20);

-- A master login without a barber card would see nobody's visits or everybody's: forbid it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_master_link;
ALTER TABLE users
  ADD CONSTRAINT users_master_link
  CHECK (role <> 'master' OR master_id IS NOT NULL);