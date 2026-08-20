#!/usr/bin/env node
/**
 * Diagnostic: test Storage delete behavior with service role key.
 * Usage: node --env-file=.env.local scripts/diagnose-delete.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = 'assets';
const PREFIX       = 'photos/';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── 1. Find a candidate with a migrated photo ─────────────────────────────────
console.log('1. Finding candidate with migrated photo...');
const { data: candidates, error: fetchErr } = await supabase
  .from('candidates')
  .select('id, full_name, photo_url')
  .like('photo_url', '%/assets/photos/%')
  .limit(1);

if (fetchErr) { console.error('   fetch error:', fetchErr); process.exit(1); }
if (!candidates?.length) { console.error('   No migrated candidates found.'); process.exit(1); }

const { id, full_name, photo_url } = candidates[0];
const filePath = `${PREFIX}${id}.jpg`;
console.log(`   Candidate : ${full_name} (${id})`);
console.log(`   photo_url : ${photo_url}`);
console.log(`   Expected Storage path: ${filePath}\n`);

// ── 2. Confirm file exists via .list() ────────────────────────────────────────
console.log('2. Checking file exists via .list()...');
const { data: listBefore, error: listErrBefore } = await supabase.storage
  .from(BUCKET)
  .list(PREFIX, { search: id });

if (listErrBefore) {
  console.log('   .list() error:', listErrBefore);
} else {
  const found = listBefore?.filter(f => f.name.startsWith(id));
  console.log(`   Files matching candidateId: ${JSON.stringify(found?.map(f => f.name))}`);
}

// ── 3. Attempt delete ─────────────────────────────────────────────────────────
console.log('\n3. Calling .remove([filePath])...');
const { data: removeData, error: removeErr } = await supabase.storage
  .from(BUCKET)
  .remove([filePath]);

console.log('   removeData:', JSON.stringify(removeData));
console.log('   removeErr :', JSON.stringify(removeErr));

// ── 4. Re-check existence ─────────────────────────────────────────────────────
console.log('\n4. Re-checking via .list() after delete...');
const { data: listAfter, error: listErrAfter } = await supabase.storage
  .from(BUCKET)
  .list(PREFIX, { search: id });

if (listErrAfter) {
  console.log('   .list() error:', listErrAfter);
} else {
  const found = listAfter?.filter(f => f.name.startsWith(id));
  console.log(`   Files matching candidateId: ${JSON.stringify(found?.map(f => f.name))}`);
  if (!found?.length) {
    console.log('   → File is GONE after delete. Delete worked.');
  } else {
    console.log('   → File STILL EXISTS after delete. Delete silently failed.');
  }
}

// ── 5. Print policy query to run manually ────────────────────────────────────
console.log('\n5. Run this in the Supabase SQL Editor to inspect Storage RLS policies:');
console.log(`
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%assets%'
ORDER BY cmd;
`);
