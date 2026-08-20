-- Drop candidate_locks table and related DB objects.
-- Locking is now handled entirely via Supabase Realtime Presence + broadcast on the
-- 'board-presence' channel (see src/app/board/page.tsx). The candidate_locks table and
-- cleanup_old_locks() function are no longer read or written by any application code.
--
-- Safety: run this ONLY after presence-based locking is confirmed working in production
-- and the deployment that removed all candidate_locks references is live. Dropping the
-- table before that deployment is deployed would break the old code path if a rollback
-- were needed.
--
-- Idempotent: safe to re-run; IF EXISTS prevents errors if objects are already gone.

BEGIN;

DROP TABLE IF EXISTS public.candidate_locks CASCADE;  -- drops table, indexes, PK, RLS policies

DROP FUNCTION IF EXISTS public.cleanup_old_locks();

COMMIT;
