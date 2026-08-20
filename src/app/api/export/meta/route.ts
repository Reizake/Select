// src/app/api/export/meta/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchExportData } from '@/lib/export/data';
import { SILO_DISPLAY_ORDER } from '@/lib/siloMeta';

export interface ExportMeta {
  silos: { name: string; statusCounts: { Recommended: number; Assigned: number; Filled: number }; roleCount: number }[];
  statusCounts: { Recommended: number; Assigned: number; Filled: number };
  totalRankedRoles: number;
  totalCandidates: number;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await fetchExportData(supabase);

    const siloMap = new Map<string, { statusCounts: { Recommended: number; Assigned: number; Filled: number }; roleIds: Set<string> }>();
    const statusCounts = { Recommended: 0, Assigned: 0, Filled: 0 };
    const candidateIds = new Set<string>();
    const rankedRoleIds = new Set<string>();

    for (const row of rows) {
      candidateIds.add(row.candidateId);
      statusCounts[row.status]++;

      if (row.roleSelectionOrder != null) rankedRoleIds.add(row.roleId);

      const siloName = row.roleSiloName || 'Other';
      const entry = siloMap.get(siloName) ?? { statusCounts: { Recommended: 0, Assigned: 0, Filled: 0 }, roleIds: new Set<string>() };
      entry.statusCounts[row.status]++;
      entry.roleIds.add(row.roleId);
      siloMap.set(siloName, entry);
    }

    const silos = [...siloMap.entries()]
      .map(([name, { statusCounts: sc, roleIds }]) => ({ name, statusCounts: sc, roleCount: roleIds.size }))
      .sort((a, b) => {
        const ai = SILO_DISPLAY_ORDER.findIndex(n => n.toLowerCase() === a.name.toLowerCase());
        const bi = SILO_DISPLAY_ORDER.findIndex(n => n.toLowerCase() === b.name.toLowerCase());
        const aIdx = ai === -1 ? Infinity : ai;
        const bIdx = bi === -1 ? Infinity : bi;
        return aIdx !== bIdx ? aIdx - bIdx : a.name.localeCompare(b.name);
      });

    const meta: ExportMeta = {
      silos,
      statusCounts,
      totalRankedRoles: rankedRoleIds.size,
      totalCandidates: candidateIds.size,
    };

    return NextResponse.json(meta);
  } catch (err) {
    console.error('[export/meta]', err);
    return NextResponse.json({ error: 'Failed to load metadata', detail: String(err) }, { status: 500 });
  }
}
