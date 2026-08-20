-- Phase 1: fractional indexing prep for candidate_role_matches.
-- Apply via Supabase Studio SQL editor before running the backfill script.
-- Adds sort_key (TEXT, nullable) and a covering index on (role_id, sort_key).
-- sort_order is unchanged and remains the source of truth through Phase 1.

ALTER TABLE candidate_role_matches ADD COLUMN sort_key TEXT;

CREATE INDEX idx_candidate_role_matches_role_sort_key
  ON candidate_role_matches (role_id, sort_key);

-- Phase 1 correction (applied during Phase 4 debugging):
-- fractional-indexing assumes byte-comparison sorting. Without
-- explicit C collation, the default database collation produced
-- case-insensitive ordering in PostgREST queries that disagreed
-- with client-side string comparison, causing generateKeyBetween
-- to throw "prevKey >= nextKey" errors on drags involving
-- mixed-case sort_key values. Forcing C collation eliminates this.

ALTER TABLE candidate_role_matches
  ALTER COLUMN sort_key TYPE TEXT COLLATE "C";
