#!/usr/bin/env node
/**
 * Migrates base64 photo_url values from the candidates table to Supabase Storage.
 * Usage:
 *   node scripts/migrate-photos-to-storage.mjs           # live run
 *   node scripts/migrate-photos-to-storage.mjs --dry-run # preview only
 *
 * Reads credentials from .env.local. Requires SUPABASE_SERVICE_ROLE_KEY.
 * Skips rows where photo_url is null or already a URL (idempotent).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUCKET = 'candidate-photos';
const DRY_RUN = process.argv.includes('--dry-run');

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
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  console.error('       The service role key is needed to bypass RLS for bulk updates.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function base64ToBuffer(dataUrl) {
  // data:image/jpeg;base64,<data>
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('Invalid data URL');
  const b64 = dataUrl.slice(comma + 1);
  return Buffer.from(b64, 'base64');
}

function mimeFromDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('  Photo Migration — base64 → Supabase Storage');
if (DRY_RUN) console.log('  MODE: DRY RUN — no changes will be written');
console.log('='.repeat(60));
console.log(`  Target: ${SUPABASE_URL}\n`);

// Fetch all candidates with base64 photo_url
const { data: candidates, error: fetchError } = await supabase
  .from('candidates')
  .select('id, full_name, photo_url')
  .like('photo_url', 'data:image/%');

if (fetchError) {
  console.error('ERROR fetching candidates:', fetchError.message);
  process.exit(1);
}

console.log(`  Found ${candidates.length} candidate(s) with base64 photos\n`);

if (candidates.length === 0) {
  console.log('  Nothing to migrate.');
  process.exit(0);
}

let migrated = 0;
let skipped = 0;
const errors = [];

for (const candidate of candidates) {
  const { id, full_name, photo_url } = candidate;
  process.stdout.write(`  ${full_name} (${id.slice(0, 8)}…) — `);

  const mime = mimeFromDataUrl(photo_url);
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg';
  const fileName = `${id}.${ext}`;

  if (DRY_RUN) {
    console.log(`[dry-run] would upload as ${fileName}`);
    migrated++;
    continue;
  }

  try {
    const buffer = base64ToBuffer(photo_url);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { upsert: true, contentType: mime });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from('candidates')
      .update({ photo_url: publicUrl })
      .eq('id', id);

    if (updateError) throw updateError;

    console.log(`migrated → ${fileName}`);
    migrated++;
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    errors.push({ id, full_name, error: err.message });
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('  Migration complete' + (DRY_RUN ? ' (dry run)' : ''));
console.log('='.repeat(60));
console.log(`  Migrated: ${migrated}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Errors:   ${errors.length}`);

if (errors.length) {
  console.log('\n  Failed candidates:');
  for (const { full_name, id, error } of errors) {
    console.log(`    ${full_name} (${id}): ${error}`);
  }
  process.exit(1);
}
