// src/lib/export/perspectives/_table.ts — server-only
// Shared flat-table sheet builder. Used by Silo and Status perspectives.
//
// Status coloring uses direct cell fills (not CF).
// CF dxf fills suffer a rendering quirk: Excel reads the fill color from <bgColor> inside
// a dxf <fill>, but ExcelJS writes it as <fgColor>, so the fill is silently ignored.
// Direct cell.fill correctly targets the normal <fills> section which uses fgColor for
// solid patterns — predictably rendered across all Excel versions.
//
// Ordering: addTable() runs first (disabling showRowStripes when statusColors is on),
// then per-cell fills are set by row reference. addTable() rewrites the cell values via
// the table element but ExcelJS cell-level formatting written afterwards persists in
// the sheet XML and takes precedence over the table's style for specific cells.
import ExcelJS from 'exceljs';
import type { ExportConfig } from '../config';
import { COLUMN_REGISTRY, type ExportRow, type ColumnKey } from '../data';

// ─── Status fill palette (exported so role.ts can reuse) ─────────────────────

export const STATUS_FILLS: Record<string, { fill: ExcelJS.Fill; font: Partial<ExcelJS.Font> }> = {
  // Light blue bg → dark navy text
  Recommended: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
    font: { color: { argb: 'FF1E3A5F' } },
  },
  // Dark navy bg → white text (high contrast essential)
  Assigned: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
    font: { color: { argb: 'FFFFFFFF' } },
  },
  // Light emerald bg → green-900 text
  Filled: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
    font: { color: { argb: 'FF14532D' } },
  },
};

// ─── Column-letter helper ─────────────────────────────────────────────────────

export function colLetter(oneBasedIdx: number): string {
  let letter = '';
  let n = oneBasedIdx;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ─── Sheet name sanitiser ────────────────────────────────────────────────────

export function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
}

// ─── Main helper ─────────────────────────────────────────────────────────────

export interface TableSheetOptions {
  worksheet: ExcelJS.Worksheet;
  colKeys: ColumnKey[];
  rows: ExportRow[];
  tableName: string;   // unique within the workbook (used when excelTable is true)
  formatting: ExportConfig['formatting'];
  /** skip sort — caller guarantees order */
  presorted?: boolean;
}

export function buildTableSheet({
  worksheet: ws,
  colKeys,
  rows,
  tableName,
  formatting,
  presorted = false,
}: TableSheetOptions): void {
  const columnDefs = colKeys.map(k => COLUMN_REGISTRY[k]);
  const statusColIdx = colKeys.indexOf('status' as ColumnKey); // -1 if absent

  // Set column widths
  ws.columns = columnDefs.map(col => ({
    header: col.header,
    width: Math.max(col.header.length + 4, 18),
  }));

  // Style header row (row 1)
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  headerRow.commit();

  // Sort rows
  const sorted = presorted ? rows : [...rows].sort((a, b) => {
    const so = (a.roleSelectionOrder ?? 9999) - (b.roleSelectionOrder ?? 9999);
    return so !== 0 ? so : a.order - b.order;
  });

  // Write data rows
  sorted.forEach(row => {
    const values = columnDefs.map(col => col.accessor(row));
    ws.addRow(values).commit();
  });

  // Freeze header
  if (formatting.freezeHeader) {
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Native Table — disable row banding when statusColors is on so fills aren't hidden
  if (formatting.excelTable && sorted.length > 0) {
    ws.addTable({
      name: `Tbl_${tableName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 240)}`,
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: !formatting.statusColors },
      columns: columnDefs.map(col => ({ name: col.header, filterButton: true })),
      rows: sorted.map(row => columnDefs.map(col => col.accessor(row))),
    });
  }

  // Direct cell fills on Status column — applied after addTable so they're not cleared.
  // Uses normal fgColor fills (not CF dxf) so they render predictably in Excel.
  if (formatting.statusColors && statusColIdx !== -1 && sorted.length > 0) {
    sorted.forEach((row, i) => {
      const style = STATUS_FILLS[row.status];
      if (!style) return;
      const cell = ws.getRow(i + 2).getCell(statusColIdx + 1); // row 1 = header
      cell.fill = style.fill;
      cell.font = { ...cell.font, ...style.font };
    });
  }
}
