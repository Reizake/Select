-- One-time cleanup: normalize candidate_role_matches.sort_order so each
-- role's matches are densely numbered 1..N with no gaps. Run any time
-- the data drifts (e.g. due to deletes that didn't renumber siblings).
-- Idempotent: re-running on already-dense data is a no-op.

begin;

-- Step 1: assign sort_order to any null rows (continuation of backfill)
with ranked_nulls as (
  select
    crm.id,
    coalesce(
      (select max(s.sort_order) from candidate_role_matches s where s.role_id = crm.role_id),
      0
    ) + row_number() over (partition by crm.role_id order by crm.created_at asc) as new_order
  from candidate_role_matches crm
  where crm.sort_order is null
)
update candidate_role_matches crm
set sort_order = ranked_nulls.new_order
from ranked_nulls
where crm.id = ranked_nulls.id;

-- Step 2: renumber all rows densely per role
with renumbered as (
  select
    id,
    row_number() over (
      partition by role_id
      order by sort_order asc, created_at asc
    ) as new_order
  from candidate_role_matches
)
update candidate_role_matches crm
set sort_order = renumbered.new_order
from renumbered
where crm.id = renumbered.id;

commit;

-- Verification: no nulls, and per-role ranks should be 1..N with no gaps
-- select count(*) from candidate_role_matches where sort_order is null;  -- expect 0
--
-- For any single role, check that max(sort_order) == count(*):
-- select role_id, max(sort_order) as max_rank, count(*) as total
-- from candidate_role_matches
-- group by role_id
-- having max(sort_order) != count(*);  -- expect 0 rows
