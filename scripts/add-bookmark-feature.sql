BEGIN;

-- Drop the dead column
ALTER TABLE candidates DROP COLUMN IF EXISTS status;

-- Add bookmark flag
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_bookmarked boolean NOT NULL DEFAULT false;

-- Enable realtime replication on candidates so toggles propagate
-- to other sessions (parallels existing channels for role_decisions,
-- candidate_role_matches).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'candidates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates';
  END IF;
END $$;

COMMIT;
