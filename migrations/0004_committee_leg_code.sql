-- Migration: Add leg_code to committee_memberships
-- Stores the TLO legislator code (e.g. "H1234") for stable diff keying.
-- Nullable so existing rows are unaffected; populated on next refresh.
ALTER TABLE "committee_memberships"
  ADD COLUMN IF NOT EXISTS "leg_code" VARCHAR(20);
