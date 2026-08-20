-- silos export — 7 rows
-- Source: https://yxrrnvdnmffuxetjxrel.supabase.co
-- Generated: 2026-05-16T01:15:19.679Z

-- Wipe existing silos first so UUIDs stay in sync with roles.silo_id.
-- roles has ON DELETE CASCADE so child rows are safe.
TRUNCATE TABLE silos RESTART IDENTITY CASCADE;

INSERT INTO silos (id, name)
VALUES
  ('11111111-0000-0000-0000-000000000006', 'CCC'),
  ('efc037f6-42c7-441c-96d8-01895cad3631', 'CORE'),
  ('11111111-0000-0000-0000-000000000001', 'HC1'),
  ('11111111-0000-0000-0000-000000000003', 'HC2'),
  ('11111111-0000-0000-0000-000000000005', 'HC3'),
  ('11111111-0000-0000-0000-000000000004', 'PO'),
  ('11111111-0000-0000-0000-000000000002', 'RO');
