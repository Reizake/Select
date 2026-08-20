-- Function: decrement sort_order for all candidate_role_matches rows
-- in a role that are ranked above a given threshold. Used to renumber
-- the recommendation list when a row is deleted, keeping ranks dense.
--
-- Usage from client after deleting a row:
--   supabase.rpc('decrement_sort_orders_above', {
--     p_role_id: '<uuid>',
--     p_threshold: <deleted_sort_order>
--   });

create or replace function decrement_sort_orders_above(
  p_role_id uuid,
  p_threshold int
) returns void
language sql
security definer
as $$
  update candidate_role_matches
  set sort_order = sort_order - 1
  where role_id = p_role_id
    and sort_order > p_threshold;
$$;

-- Grant execute to authenticated users
grant execute on function decrement_sort_orders_above(uuid, int) to authenticated;
