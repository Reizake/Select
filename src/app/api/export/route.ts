// src/app/api/export/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchExportData } from '@/lib/export/data';
import { DEFAULT_CONFIG, type ExportConfig } from '@/lib/export/config';
import { buildSiloPerspective }   from '@/lib/export/perspectives/silo';
import { buildStatusPerspective } from '@/lib/export/perspectives/status';
import { buildRolePerspective }   from '@/lib/export/perspectives/role';

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse config (merge over defaults so Phase-2/3 additions slot in cleanly)
  let config: ExportConfig;
  try {
    const body = await req.json().catch(() => ({}));
    config = { ...DEFAULT_CONFIG, ...body, formatting: { ...DEFAULT_CONFIG.formatting, ...body?.formatting } };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  try {
    const rows = await fetchExportData(supabase);

    let buffer: Buffer;
    switch (config.perspective) {
      case 'silo':
        buffer = await buildSiloPerspective(rows, config);
        break;
      case 'status':
        buffer = await buildStatusPerspective(rows, config);
        break;
      case 'role':
        buffer = await buildRolePerspective(rows, config);
        break;
      default:
        return NextResponse.json({ error: 'Unknown perspective' }, { status: 400 });
    }

    const fileName = config.fileName || 'selection-board-export.xlsx';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('[export]', err);
    return NextResponse.json({ error: 'Export failed', detail: String(err) }, { status: 500 });
  }
}
