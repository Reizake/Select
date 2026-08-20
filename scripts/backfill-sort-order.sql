-- Backfill candidate_role_matches.sort_order for rows where it is null.
-- Context: as of May 22, 2026, 300 of 339 rows had null sort_order.
-- Only drag-reordered matches had values; matches created via the
-- EditCandidateModal were inserted with sort_order unset.
-- This script is idempotent: re-running it after Phase 3 lands will
-- find zero null rows and do nothing.
--
-- For each role, null sort_orders are assigned values continuing from
-- (max existing sort_order in that role) + 1, ordered by created_at
-- ascending. Existing non-null sort_orders are not modified.

begin;

with ranked as (
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
set sort_order = ranked.new_order
from ranked
where crm.id = ranked.id;

commit;

-- Verification (run separately after the above):
-- select count(*) from candidate_role_matches where sort_order is null;
-- Expected: 0
