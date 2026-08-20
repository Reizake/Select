/**
 * Phase 1 backfill: populate sort_key on candidate_role_matches from sort_order.
 *
 * Usage (run from project root):
 *   npx tsx scripts/backfill-sort-keys.ts
 *
 * Requires .env.local in the project root with:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Safe to re-run: rows that already have sort_key set are skipped.
 * Within each role group, keys are generated positionally from
 * (sort_order ASC NULLS LAST, id ASC), matching the app's loadOrder query.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { generateKeyBetween } from 'fractional-indexing';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error } = await supabase
    .from('candidate_role_matches')
    .select('id, role_id, sort_order, sort_key')
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to fetch rows:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('No rows found.');
    return;
  }

  // Group by role_id
  const byRole = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
    byRole.get(row.role_id)!.push(row);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [roleId, roleRows] of byRole) {
    // Match the app's loadOrder sort: sort_order ASC NULLS LAST, then id ASC for ties
    roleRows.sort((a, b) => {
      if (a.sort_order == null && b.sort_order == null) return a.id < b.id ? -1 : 1;
      if (a.sort_order == null) return 1;
      if (b.sort_order == null) return -1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id < b.id ? -1 : 1;
    });

    let prev: string | null = null;
    let roleUpdated = 0;
    let roleSkipped = 0;

    for (const row of roleRows) {
      // Always advance prev through each position so keys are consistent across partial runs
      const key = generateKeyBetween(prev, null);
      prev = key;

      if (row.sort_key != null) {
        roleSkipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('candidate_role_matches')
        .update({ sort_key: key })
        .eq('id', row.id);

      if (updateError) {
        console.error(`  Failed to update row ${row.id}:`, updateError.message);
      } else {
        roleUpdated++;
      }
    }

    totalUpdated += roleUpdated;
    totalSkipped += roleSkipped;
    console.log(`role ${roleId}: ${roleUpdated} updated, ${roleSkipped} skipped`);
  }

  console.log(`\nDone. ${totalUpdated} rows updated, ${totalSkipped} skipped (already had sort_key).`);
}

main();
