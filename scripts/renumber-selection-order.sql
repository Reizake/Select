-- Renumber roles.selection_order to be contiguous 1..N
-- preserving current relative order. Duplicates broken by created_at DESC
-- (newer role gets the lower number).
-- Scope: roles with selection_order < 320.
-- Excluded (left as-is): selection_order = 320 (test role)
--                       selection_order >= 400 (CORE roles)
--                       selection_order IS NULL
BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY selection_order ASC, created_at DESC) AS new_order
  FROM roles
  WHERE selection_order IS NOT NULL
    AND selection_order < 320
)
UPDATE roles r
SET selection_order = ranked.new_order,
    updated_at = NOW()
FROM ranked
WHERE r.id = ranked.id
  AND r.selection_order IS DISTINCT FROM ranked.new_order;

-- Verify before committing
SELECT
  COUNT(*) FILTER (WHERE selection_order IS NOT NULL AND selection_order < 320) AS renumbered_count,
  MIN(selection_order) FILTER (WHERE selection_order IS NOT NULL AND selection_order < 320) AS min_renumbered,
  MAX(selection_order) FILTER (WHERE selection_order IS NOT NULL AND selection_order < 320) AS max_renumbered,
  COUNT(*) FILTER (WHERE selection_order = 320) AS test_role_count,
  COUNT(*) FILTER (WHERE selection_order >= 400) AS core_role_count,
  COUNT(*) FILTER (WHERE selection_order IS NULL) AS null_count,
  COUNT(*) AS total_roles
FROM roles;

-- Check for any unexpected gaps in the renumbered range
SELECT generate_series(1, (
  SELECT MAX(selection_order) FROM roles WHERE selection_order < 320
)) AS expected_value
EXCEPT
SELECT selection_order FROM roles WHERE selection_order < 320
ORDER BY expected_value;

COMMIT;