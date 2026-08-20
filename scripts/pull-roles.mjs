#!/usr/bin/env node
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/pull-roles.mjs
// Or pass as positional args:
//   node scripts/pull-roles.mjs https://xxxx.supabase.co eyJ...

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL || process.argv[2];
const key = process.env.SUPABASE_ANON_KEY || process.argv[3];

if (!url || !key) {
  console.error('Error: Supabase URL and anon key are required.');
  console.error('  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/pull-roles.mjs');
  console.error('  node scripts/pull-roles.mjs <url> <anon-key>');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: roles, error } = await supabase
  .from('roles')
  .select('id, silo_id, title, description, qualities, selection_order, proximity_score, created_at')
  .order('selection_order', { ascending: true, nullsFirst: false });

if (error) {
  console.error('Failed to fetch roles:', error.message);
  process.exit(1);
}

if (!roles || roles.length === 0) {
  console.warn('No rows found in roles table.');
  process.exit(0);
}

// Escape a JS value to a SQL literal
function toSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  // Strings: escape single quotes by doubling them
  return `'${String(value).replace(/'/g, "''")}'`;
}

const columns = [
  'id',
  'silo_id',
  'title',
  'description',
  'qualities',
  'selection_order',
  'proximity_score',
  'created_at',
];

const valueRows = roles.map((role) => {
  const vals = columns.map((col) => toSql(role[col]));
  return `  (${vals.join(', ')})`;
});

const sql = [
  `-- roles export — ${roles.length} rows`,
  `-- Source: ${url}`,
  `-- Generated: ${new Date().toISOString()}`,
  '',
  `INSERT INTO roles (${columns.join(', ')})`,
  'VALUES',
  valueRows.join(',\n'),
  'ON CONFLICT (id) DO UPDATE SET',
  '  silo_id          = EXCLUDED.silo_id,',
  '  title            = EXCLUDED.title,',
  '  description      = EXCLUDED.description,',
  '  qualities        = EXCLUDED.qualities,',
  '  selection_order  = EXCLUDED.selection_order,',
  '  proximity_score  = EXCLUDED.proximity_score,',
  '  created_at       = EXCLUDED.created_at;',
  '',
].join('\n');

const outPath = resolve(__dirname, 'roles-export.sql');
writeFileSync(outPath, sql, 'utf8');

console.log(`Exported ${roles.length} roles → ${outPath}`);
