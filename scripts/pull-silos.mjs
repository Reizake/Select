#!/usr/bin/env node
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/pull-silos.mjs
// Or pass as positional args:
//   node scripts/pull-silos.mjs https://xxxx.supabase.co eyJ...

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL || process.argv[2];
const key = process.env.SUPABASE_ANON_KEY || process.argv[3];

if (!url || !key) {
  console.error('Error: Supabase URL and anon key are required.');
  console.error('  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/pull-silos.mjs');
  console.error('  node scripts/pull-silos.mjs <url> <anon-key>');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: silos, error } = await supabase
  .from('silos')
  .select('id, name')
  .order('name', { ascending: true });

if (error) {
  console.error('Failed to fetch silos:', error.message);
  process.exit(1);
}

if (!silos || silos.length === 0) {
  console.warn('No rows found in silos table.');
  process.exit(0);
}

function toSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

const columns = ['id', 'name'];

const valueRows = silos.map((silo) => {
  const vals = columns.map((col) => toSql(silo[col]));
  return `  (${vals.join(', ')})`;
});

const sql = [
  `-- silos export — ${silos.length} rows`,
  `-- Source: ${url}`,
  `-- Generated: ${new Date().toISOString()}`,
  '',
  '-- Wipe existing silos first so UUIDs stay in sync with roles.silo_id.',
  '-- roles has ON DELETE CASCADE so child rows are safe.',
  'TRUNCATE TABLE silos RESTART IDENTITY CASCADE;',
  '',
  `INSERT INTO silos (${columns.join(', ')})`,
  'VALUES',
  valueRows.join(',\n') + ';',
  '',
].join('\n');

const outPath = resolve(__dirname, 'silos-export.sql');
writeFileSync(outPath, sql, 'utf8');

console.log(`Exported ${silos.length} silos → ${outPath}`);
