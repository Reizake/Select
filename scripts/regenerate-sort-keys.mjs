#!/usr/bin/env node
/**
 * Regenerates sort_key for every candidate_role_matches row, replacing
 * zero-padded legacy keys (e.g. "a000010") with valid fractional-indexing keys.
 *
 * Ordering: rows per role are ordered by sort_key ASC (nulls last) —
 * identical to the app's loadOrder query — so the visual order is preserved.
 * Does NOT order by sort_order; that field is maintained separately for the
 * decrement_sort_orders_above RPC and is not touched here.
 *
 * Idempotent: safe to re-run.
 * Paginates the load so >1000-row datasets are handled correctly.
 *
 * Usage:  node scripts/regenerate-sort-keys.mjs
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { generateKeyBetween } from 'fractional-indexing/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv(filePath) {
  const env = {};
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); }
  catch { return env; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv(resolve(ROOT, '.env.local'));
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Paginate: Supabase defaults to 1000 rows max per query.
const PAGE_SIZE = 1000;
const allRows = [];
let from = 0;
while (true) {
  const { data, error } = await supabase
    .from('candidate_role_matches')
    .select('id, role_id, sort_key')
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }) 
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error('Failed to load candidate_role_matches:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  allRows.push(...data);
  if (data.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}

console.log(`Loaded ${allRows.length} rows across all roles.`);

// Group by role_id, preserving the sort_key-ordered sequence from the query.
const byRole = new Map();
for (const row of allRows) {
  if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
  byRole.get(row.role_id).push(row);
}

let totalUpdated = 0;

for (const [roleId, rows] of byRole) {
  const n = rows.length;
  const newKeys = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null);
    newKeys.push(prev);
  }
  for (let i = 0; i < n; i++) {
    const { error: updErr } = await supabase
      .from('candidate_role_matches')
      .update({ sort_key: newKeys[i] })
      .eq('id', rows[i].id);
    if (updErr) {
      console.error(`  Failed to update row ${rows[i].id}:`, updErr.message);
    }
  }

  console.log(`role ${roleId}: regenerated ${n} keys`);
  totalUpdated += n;
}

console.log(`\nDone. Regenerated ${totalUpdated} sort_key values across ${byRole.size} roles.`);
