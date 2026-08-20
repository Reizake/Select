#!/usr/bin/env node
/**
 * Imports candidates from candidates-merged.csv into Supabase candidates table.
 * Usage:  node scripts/import-candidates.mjs
 *
 * Reads credentials from .env.local in the project root.
 * Input:  C:/dev/data/candidates-merged.csv
 * Errors: scripts/import-errors.csv
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const INPUT_CSV = 'C:/dev/data/candidates-merged.csv';
const ERRORS_CSV = resolve(__dirname, 'import-errors.csv');
const BATCH_SIZE = 100;

// ─── Load .env.local ──────────────────────────────────────────────────────────

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
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
  || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  || env['SUPABASE_ANON_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Could not find SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!env['SUPABASE_SERVICE_ROLE_KEY']) {
  console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY not found — falling back to anon key.');
  console.warn('         Inserts will likely fail due to RLS. Add the service role key to .env.local.\n');
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const raw = readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  let i = 0;
  function parseField() {
    if (raw[i] === '"') {
      i++; let val = '';
      while (i < raw.length) {
        if (raw[i] === '"' && raw[i + 1] === '"') { val += '"'; i += 2; }
        else if (raw[i] === '"') { i++; break; }
        else { val += raw[i++]; }
      }
      return val;
    }
    let val = '';
    while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') val += raw[i++];
    return val;
  }
  function parseRow() {
    const fields = [];
    while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
      fields.push(parseField());
      if (raw[i] === ',') i++;
    }
    while (i < raw.length && (raw[i] === '\r' || raw[i] === '\n')) i++;
    return fields;
  }
  const headers = parseRow().map(h => h.trim());
  const rows = [];
  while (i < raw.length) {
    if (raw[i] === '\r' || raw[i] === '\n') { i++; continue; }
    const fields = parseRow();
    if (fields.every(f => !f.trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (fields[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_COLS = new Set([
  'full_name', 'congregation', 'age', 'location',
  'current_responsibilities', 'circuit_responsibilities',
  'experience', 'comments', 'co_comments', 'status',
]);

// Columns in the merged CSV that are NOT part of the schema (will be stripped)
const STRIP_COLS = new Set(['match_confidence', 'source', 'file_origin']);

// ─── Transform Row ────────────────────────────────────────────────────────────

function transformRow(raw) {
  const row = {};
  for (const col of SCHEMA_COLS) {
    if (col === 'status') continue; // handled below
    const val = (raw[col] ?? '').trim();
    if (col === 'age') {
      const n = parseInt(val, 10);
      row.age = Number.isFinite(n) && n > 0 ? n : null;
    } else {
      row[col] = val || null;
    }
  }
  // Default status — merged CSV doesn't include it
  row.status = (raw['status'] ?? '').trim() || 'discuss';
  return row;
}

// ─── CSV Writer for Errors ────────────────────────────────────────────────────

function escapeField(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r'))
    return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeErrorsCSV(errors) {
  if (!errors.length) return;
  const cols = ['row_number', 'full_name', 'error', ...Array.from(SCHEMA_COLS)];
  const lines = [cols.join(',')];
  for (const { rowNumber, transformed, error } of errors) {
    lines.push(cols.map(col => {
      if (col === 'row_number') return escapeField(rowNumber);
      if (col === 'error') return escapeField(error);
      return escapeField(transformed[col] ?? '');
    }).join(','));
  }
  writeFileSync(ERRORS_CSV, lines.join('\n'), 'utf8');
  console.log(`\n  Error details written to: ${ERRORS_CSV}`);
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('  Candidate Import Script');
console.log('='.repeat(60));

// 1. Parse CSV
console.log(`\nReading: ${INPUT_CSV}`);
let headers, rows;
try {
  ({ headers, rows } = parseCSV(INPUT_CSV));
} catch (err) {
  console.error(`ERROR reading CSV: ${err.message}`);
  process.exit(1);
}

console.log(`  Found ${rows.length} rows with ${headers.length} columns`);

// 2. Validate columns
const csvCols = new Set(headers);
const knownCols   = [...csvCols].filter(c => SCHEMA_COLS.has(c));
const strippedCols = [...csvCols].filter(c => STRIP_COLS.has(c));
const unknownCols  = [...csvCols].filter(c => !SCHEMA_COLS.has(c) && !STRIP_COLS.has(c));
const missingCols  = [...SCHEMA_COLS].filter(c => c !== 'status' && !csvCols.has(c));

console.log(`\nColumn validation:`);
console.log(`  Matched schema columns:  ${knownCols.join(', ')}`);
if (strippedCols.length)
  console.log(`  Stripping (not in DB):   ${strippedCols.join(', ')}`);
if (unknownCols.length)
  console.log(`  WARNING - unknown cols:  ${unknownCols.join(', ')}`);
if (missingCols.length)
  console.log(`  Missing schema columns:  ${missingCols.join(', ')} (will be null)`);
console.log(`  status: not in CSV — will default to "discuss" for all rows`);

// 3. Transform all rows
const transformed = rows.map(transformRow);

// 4. Preview first 3 rows
console.log('\n' + '─'.repeat(60));
console.log('  Preview — first 3 rows after transformation:');
console.log('─'.repeat(60));
for (let i = 0; i < Math.min(3, transformed.length); i++) {
  const r = transformed[i];
  console.log(`\n  Row ${i + 1}:`);
  console.log(`    full_name:                ${r.full_name ?? '(null)'}`);
  console.log(`    congregation:             ${r.congregation ?? '(null)'}`);
  console.log(`    age:                      ${r.age ?? '(null)'}`);
  console.log(`    location:                 ${r.location ?? '(null)'}`);
  console.log(`    current_responsibilities: ${String(r.current_responsibilities ?? '').slice(0, 80)}${(r.current_responsibilities ?? '').length > 80 ? '…' : ''}`);
  console.log(`    circuit_responsibilities: ${String(r.circuit_responsibilities ?? '').slice(0, 80)}${(r.circuit_responsibilities ?? '').length > 80 ? '…' : ''}`);
  console.log(`    experience:               ${String(r.experience ?? '').slice(0, 80)}${(r.experience ?? '').length > 80 ? '…' : ''}`);
  console.log(`    comments:                 ${String(r.comments ?? '').slice(0, 80)}${(r.comments ?? '').length > 80 ? '…' : ''}`);
  console.log(`    co_comments:              ${String(r.co_comments ?? '').slice(0, 80)}${(r.co_comments ?? '').length > 80 ? '…' : ''}`);
  console.log(`    status:                   ${r.status}`);
}

// 5. Summary stats
const withAge       = transformed.filter(r => r.age !== null).length;
const withCoCom     = transformed.filter(r => r.co_comments).length;
const withExp       = transformed.filter(r => r.experience).length;
const withCurResp   = transformed.filter(r => r.current_responsibilities).length;
console.log('\n' + '─'.repeat(60));
console.log('  Import summary:');
console.log('─'.repeat(60));
console.log(`  Total rows:                ${transformed.length}`);
console.log(`  With age:                  ${withAge}`);
console.log(`  With current_resp:         ${withCurResp}`);
console.log(`  With experience:           ${withExp}`);
console.log(`  With co_comments:          ${withCoCom}`);
console.log(`  Target: ${SUPABASE_URL}`);

// 6. Confirm
console.log('');
const answer = await confirm('Proceed with import? (yes/no): ');
if (answer !== 'yes' && answer !== 'y') {
  console.log('\nImport cancelled.');
  process.exit(0);
}

// 7. Import
console.log('\nConnecting to Supabase...');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`\nImporting ${transformed.length} rows in batches of ${BATCH_SIZE}...\n`);

let totalInserted = 0;
let totalFailed = 0;
const errorRows = [];

for (let start = 0; start < transformed.length; start += BATCH_SIZE) {
  const batch = transformed.slice(start, start + BATCH_SIZE);
  const batchEnd = Math.min(start + BATCH_SIZE, transformed.length);

  const { error } = await supabase.from('candidates').insert(batch);

  if (error) {
    // Batch failed — try rows individually to identify which ones failed
    for (let j = 0; j < batch.length; j++) {
      const singleRow = batch[j];
      const { error: rowErr } = await supabase.from('candidates').insert([singleRow]);
      if (rowErr) {
        totalFailed++;
        errorRows.push({
          rowNumber: start + j + 2, // +2: 1-based + header row
          transformed: singleRow,
          error: rowErr.message,
        });
        console.error(`  ✗ Row ${start + j + 2} (${singleRow.full_name ?? 'unknown'}): ${rowErr.message}`);
      } else {
        totalInserted++;
      }
    }
  } else {
    totalInserted += batch.length;
  }

  process.stdout.write(`  Imported ${Math.min(start + BATCH_SIZE, transformed.length)}/${transformed.length}...\r`);
}

// 8. Final summary
console.log('\n\n' + '='.repeat(60));
console.log('  Import complete');
console.log('='.repeat(60));
console.log(`  Total inserted:  ${totalInserted}`);
console.log(`  Total failed:    ${totalFailed}`);

if (errorRows.length) {
  console.log(`\n  Failed rows:`);
  for (const { rowNumber, transformed: r, error } of errorRows) {
    console.log(`    Row ${rowNumber}: ${r.full_name ?? '(unknown)'} — ${error}`);
  }
  writeErrorsCSV(errorRows);
} else {
  console.log('\n  No errors — all rows imported successfully.');
}
