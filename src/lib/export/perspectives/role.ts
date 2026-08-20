// src/lib/export/perspectives/role.ts — server-only
// By Role:
//   Flat mode  (!statusFilter.includes('Recommended')): one row per ranked role via buildTableSheet.
//   Sectioned  (statusFilter includes 'Recommended'):   one section per ranked role, manual banding.
import ExcelJS from 'exceljs';
import type { ExportConfig } from '../config';
import { COLUMN_REGISTRY, DEFAULT_COLUMNS, type ExportRow, type ColumnKey } from '../data';
import { buildTableSheet, STATUS_FILLS } from './_table';

// Suppressed from per-row output in sectioned mode (rendered in section headers instead)
const ROLE_HEADER_KEYS = new Set<string>(['role', 'selectionOrder', 'description', 'qualities', 'proximityScore']);

// Flat mode: role identity always leads; role-detail toggles always trail
const FLAT_LEAD  = ['selectionOrder', 'role', 'silo'] as const;
const FLAT_TRAIL = ['description', 'qualities', 'proximityScore'] as const;

export async function buildRolePerspective(
  rows: ExportRow[],
  config: ExportConfig,
): Promise<Buffer> {
  const byRoleFlat = !config.statusFilter.includes('Recommended');

  // ── Ranked roles ascending — shared by both modes ─────────────────────────
  type RoleInfo = {
    roleId: string; selectionOrder: number; title: string; siloName: string;
    description: string; qualities: string; proximityScore: number | null;
  };
  const rankedRoles: RoleInfo[] = [];
  const seenRoles = new Set<string>();
  for (const r of rows) {
    if (r.roleSelectionOrder == null || seenRoles.has(r.roleId)) continue;
    seenRoles.add(r.roleId);
    rankedRoles.push({
      roleId: r.roleId, selectionOrder: r.roleSelectionOrder, title: r.roleTitle,
      siloName: r.roleSiloName, description: r.roleDescription,
      qualities: r.roleQualities, proximityScore: r.roleProximityScore,
    });
  }
  rankedRoles.sort((a, b) => a.selectionOrder - b.selectionOrder);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Selection Board';
  workbook.created = new Date();

  if (byRoleFlat) {
    // ── FLAT MODE: one row per ranked role ───────────────────────────────────
    const leadSet  = new Set<string>(FLAT_LEAD);
    const trailSet = new Set<string>(FLAT_TRAIL);

    const userKeys: ColumnKey[] = (config.columns.length > 0 ? config.columns : DEFAULT_COLUMNS)
      .filter((k): k is ColumnKey => k in COLUMN_REGISTRY);

    // Lead: always selectionOrder → role → silo; trail: any enabled detail toggles; mid: the rest
    const trailKeys = (FLAT_TRAIL as readonly string[]).filter(k => userKeys.includes(k as ColumnKey)) as ColumnKey[];
    const midKeys   = userKeys.filter(k => !leadSet.has(k) && !trailSet.has(k));
    const flatColKeys: ColumnKey[] = [...FLAT_LEAD as readonly ColumnKey[], ...midKeys, ...trailKeys];

    // A role has at most one Assigned/Filled row (single selected_candidate_id)
    const assigneeByRole = new Map<string, ExportRow>();
    for (const r of rows) {
      if (config.statusFilter.includes(r.status)) assigneeByRole.set(r.roleId, r);
    }

    // Build flat row list — blank ExportRow for roles with no matching assignee
    const blankIndices = new Set<number>();
    const flatRows: ExportRow[] = rankedRoles.map((role, i) => {
      const assignee = assigneeByRole.get(role.roleId);
      if (assignee) return assignee;
      blankIndices.add(i);
      return {
        roleId: role.roleId, roleTitle: role.title,
        roleSelectionOrder: role.selectionOrder, roleSiloId: '',
        roleSiloName: role.siloName, roleDescription: role.description,
        roleQualities: role.qualities, roleProximityScore: role.proximityScore,
        candidateId: '', fullName: '', lastName: '', firstName: '', middle: '',
        congregation: '', age: null, location: '',
        cellPhone: '', personalEmail: '', jwpubEmail: '', bethelEmail: '',
        current: '', circuit: '',
        experience: '', comments: '', coComments: '', order: 0,
        status: 'Recommended', assignedRole: '', filled: 'No',
      };
    });

    const ws = workbook.addWorksheet('Selection order');
    buildTableSheet({
      worksheet: ws,
      colKeys: flatColKeys,
      rows: flatRows,
      tableName: 'Role_Flat',
      // Always native table + freeze; suppress automatic status coloring so we control it below
      formatting: { ...config.formatting, excelTable: true, freezeHeader: true, statusColors: false },
      presorted: true,
    });

    // Apply status colors only to rows with a real assignee; blank rows get no fill
    if (config.formatting.statusColors) {
      const statusIdx = flatColKeys.indexOf('status' as ColumnKey);
      if (statusIdx !== -1) {
        flatRows.forEach((row, i) => {
          if (blankIndices.has(i)) return;
          const style = STATUS_FILLS[row.status];
          if (!style) return;
          const cell = ws.getRow(i + 2).getCell(statusIdx + 1);
          cell.fill = style.fill;
          cell.font = { ...cell.font, ...style.font };
        });
      }
    }
  } else {
    // ── SECTIONED MODE: one section per ranked role ───────────────────────────
    const allColKeys: ColumnKey[] = (config.columns.length > 0 ? config.columns : DEFAULT_COLUMNS)
      .filter((k): k is ColumnKey => k in COLUMN_REGISTRY && !ROLE_HEADER_KEYS.has(k));

    const wantDescription    = (config.columns.length > 0 ? config.columns : []).includes('description');
    const wantQualities      = (config.columns.length > 0 ? config.columns : []).includes('qualities');
    const wantProximityScore = (config.columns.length > 0 ? config.columns : []).includes('proximityScore');

    const statusColIdx = allColKeys.indexOf('status' as ColumnKey);
    const numCols      = allColKeys.length;
    const columnDefs   = allColKeys.map(k => COLUMN_REGISTRY[k]);

    // Group rows by roleId (status-filtered)
    const rowsByRole = new Map<string, ExportRow[]>();
    for (const r of rows) {
      if (config.statusFilter.includes(r.status)) {
        const arr = rowsByRole.get(r.roleId) ?? [];
        arr.push(r);
        rowsByRole.set(r.roleId, arr);
      }
    }

    const ws = workbook.addWorksheet('Selection order');
    ws.columns = columnDefs.map(col => ({ width: Math.max(col.header.length + 4, 18) }));

    const sharedHeader = ws.addRow(columnDefs.map(col => col.header));
    sharedHeader.font = { bold: true };
    sharedHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sharedHeader.commit();

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    for (const role of rankedRoles) {
      const headerLine1 = [`#${role.selectionOrder}  ${role.title}`, role.siloName, ...Array(Math.max(0, numCols - 2)).fill('')];
      const hRow1 = ws.addRow(headerLine1);
      hRow1.font = { bold: true, size: 12 };
      hRow1.fill = headerFill;
      hRow1.getCell(1).font = { bold: true, size: 12 };
      hRow1.commit();

      if (wantDescription && role.description) {
        const dRow = ws.addRow([`Description: ${role.description}`, ...Array(numCols - 1).fill('')]);
        dRow.fill = headerFill;
        dRow.font = { italic: true, color: { argb: 'FF475569' } };
        dRow.commit();
      }
      if (wantQualities && role.qualities) {
        const qRow = ws.addRow([`Qualities: ${role.qualities}`, ...Array(numCols - 1).fill('')]);
        qRow.fill = headerFill;
        qRow.font = { italic: true, color: { argb: 'FF475569' } };
        qRow.commit();
      }
      if (wantProximityScore && role.proximityScore != null) {
        const pRow = ws.addRow([`Proximity score: ${role.proximityScore}`, ...Array(numCols - 1).fill('')]);
        pRow.fill = headerFill;
        pRow.commit();
      }

      const roleRows = (rowsByRole.get(role.roleId) ?? []).sort((a, b) => a.order - b.order);

      if (roleRows.length === 0) {
        const noneRow = ws.addRow(['(none recommended)', ...Array(numCols - 1).fill('')]);
        noneRow.font = { italic: true, color: { argb: 'FF94A3B8' } };
        noneRow.commit();
      } else {
        roleRows.forEach((r, i) => {
          const values = columnDefs.map(col => col.accessor(r));
          const dataRow = ws.addRow(values);
          if (i % 2 === 1) {
            dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
          if (config.formatting.statusColors && statusColIdx !== -1) {
            const style = STATUS_FILLS[r.status];
            if (style) {
              const statusCell = dataRow.getCell(statusColIdx + 1);
              statusCell.fill = style.fill;
              statusCell.font = { ...statusCell.font, ...style.font };
            }
          }
          dataRow.commit();
        });
      }

      ws.addRow([]).commit();
    }

    if (rankedRoles.length === 0) {
      ws.addRow(['No ranked roles.']).commit();
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
