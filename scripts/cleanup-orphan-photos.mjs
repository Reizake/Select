#!/usr/bin/env node
/**
 * Cleans up orphaned files in the assets/photos Storage bucket.
 *
 * Orphans accumulate in two ways:
 *   1. Replacement leftovers — old timestamped files after a new photo is uploaded
 *      for the same candidate (best-effort cleanup in the helper can be unreliable).
 *   2. Detachment — candidates whose photo_url was nulled in the UI (remove photo)
 *      or candidates that were deleted entirely.
 *
 * Usage:
 *   npm run cleanup:photos:dry    # preview only (default — no deletes)
 *   npm run cleanup:photos:apply  # actually delete orphans
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUCKET = 'assets';
const PHOTO_FOLDER = 'photos';
const PHOTO_PREFIX = `${PHOTO_FOLDER}/`;
const APPLY = process.argv.includes('--apply');
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
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Phase 1: Inventory Storage ───────────────────────────────────────────────

console.log('='.repeat(60));
console.log(`  Orphan Photo Cleanup — assets/${PHOTO_FOLDER}/`);
console.log(`  Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (no deletes)'}`);
console.log('='.repeat(60));

console.log('\n1. Listing all files in Storage...');

const allFiles = [];
let offset = 0;

while (true) {
  let page;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PHOTO_FOLDER, { limit: BATCH_SIZE, offset });

    if (error) throw error;
    page = data ?? [];
  } catch (err) {
    console.error(`   ERROR listing Storage (offset ${offset}):`, err.message);
    process.exit(1);
  }

  allFiles.push(...page);
  if (page.length < BATCH_SIZE) break;
  offset += BATCH_SIZE;
}

// Filter out Supabase folder placeholder artifacts
const storageFiles = allFiles.filter(f => f.name !== '.emptyFolderPlaceholder');
console.log(`   Found ${storageFiles.length} file(s) (${allFiles.length - storageFiles.length} placeholder(s) excluded)`);

// ─── Phase 2: Inventory DB ────────────────────────────────────────────────────

console.log('\n2. Fetching referenced photo URLs from candidates table...');

let referencedFilenames;
try {
  const { data: candidates, error } = await supabase
    .from('candidates')
    .select('photo_url')
    .not('photo_url', 'is', null);

  if (error) throw error;

  // Extract just the filename (part after /photos/)
  referencedFilenames = new Set(
    (candidates ?? [])
      .map(c => {
        const url = c.photo_url;
        const marker = `/photos/`;
        const idx = url.lastIndexOf(marker);
        return idx !== -1 ? url.slice(idx + marker.length) : null;
      })
      .filter(Boolean)
  );
} catch (err) {
  console.error('   ERROR fetching candidates:', err.message);
  process.exit(1);
}

console.log(`   Found ${referencedFilenames.size} unique referenced filename(s)`);

// ─── Phase 3: Classify ────────────────────────────────────────────────────────

console.log('\n3. Classifying files...\n');

const orphans = [];
let totalBytes = 0;
let orphanBytes = 0;

for (const file of storageFiles) {
  const size = file.metadata?.size ?? 0;
  totalBytes += size;
  const isReferenced = referencedFilenames.has(file.name);

  if (isReferenced) {
    console.log(`   [KEEP]   ${file.name} (${(size / 1024).toFixed(1)} KB)`);
  } else {
    orphanBytes += size;
    orphans.push(`${PHOTO_PREFIX}${file.name}`);
    const tag = APPLY ? '[DELETE]' : '[WOULD-DELETE]';
    console.log(`   ${tag} ${file.name} (${(size / 1024).toFixed(1)} KB)`);
  }
}

// ─── Phase 4: Delete (apply mode only) ───────────────────────────────────────

let deleted = 0;
let deleteErrors = 0;

if (APPLY && orphans.length > 0) {
  console.log(`\n4. Deleting ${orphans.length} orphan(s) in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = orphans.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) throw error;
      deleted += batch.length;
      console.log(`   Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} file(s))`);
    } catch (err) {
      deleteErrors += batch.length;
      console.error(`   ERROR deleting batch:`, err.message);
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`  Summary${APPLY ? '' : ' (dry run)'}`);
console.log('='.repeat(60));
console.log(`  Total files in Storage : ${storageFiles.length}`);
console.log(`  Referenced (keep)      : ${storageFiles.length - orphans.length}`);
console.log(`  Orphans found          : ${orphans.length}`);
console.log(`  Space to free          : ${(orphanBytes / 1024).toFixed(1)} KB`);

if (APPLY) {
  console.log(`  Deleted                : ${deleted}`);
  if (deleteErrors > 0) console.log(`  Delete errors          : ${deleteErrors}`);
} else {
  console.log('\n  Run with --apply to delete orphans:');
  console.log('  npm run cleanup:photos:apply');
}
