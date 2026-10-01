-- IF NOT EXISTS: the column was added to the live database by hand just
-- before this shipped (no downtime), so applying this records it rather
-- than failing.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;
