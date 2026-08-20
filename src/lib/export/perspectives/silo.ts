// src/lib/export/perspectives/silo.ts — server-only
import ExcelJS from 'exceljs';
import type { ExportConfig } from '../config';
import { COLUMN_REGISTRY, DEFAULT_COLUMNS, type ExportRow, type ColumnKey } from '../data';
import { buildTableSheet, sanitizeSheetName } from './_table';
import { SILO_DISPLAY_ORDER } from '@/lib/siloMeta';

export async function buildSiloPerspective(
  rows: ExportRow[],
  config: ExportConfig,
): Promise<Buffer> {
  const colKeys: ColumnKey[] = (
    config.columns.length > 0 ? config.columns : DEFAULT_COLUMNS
  ).filter((k): k is ColumnKey => k in COLUMN_REGISTRY);

  // Apply status filter then silo filter — both paths share the same filtered set
  const statusFiltered = rows.filter(r => config.statusFilter.includes(r.status));
  const filtered = (config.silos && config.silos.length > 0)
    ? statusFiltered.filter(r => config.silos!.includes(r.roleSiloName || 'Other'))
    : statusFiltered;

  // Group by silo name
  const siloGroups = new Map<string, ExportRow[]>();
  for (const row of filtered) {
    const silo = row.roleSiloName || 'Other';
    if (!siloGroups.has(silo)) siloGroups.set(silo, []);
    siloGroups.get(silo)!.push(row);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Selection Board';
  workbook.created = new Date();

  let sheetIndex = 0;
  const addSheet = (sheetName: string, sheetRows: ExportRow[]) => {
    const ws = workbook.addWorksheet(sanitizeSheetName(sheetName));
    buildTableSheet({
      worksheet: ws,
      colKeys,
      rows: sheetRows,
      tableName: `Silo_${sheetIndex++}`,
      formatting: config.formatting,
    });
  };

  if (config.onePerSheet) {
    const orderedEntries = [...siloGroups.entries()].sort((a, b) => {
      const ai = SILO_DISPLAY_ORDER.findIndex(n => n.toLowerCase() === a[0].toLowerCase());
      const bi = SILO_DISPLAY_ORDER.findIndex(n => n.toLowerCase() === b[0].toLowerCase());
      const aIdx = ai === -1 ? Infinity : ai;
      const bIdx = bi === -1 ? Infinity : bi;
      return aIdx !== bIdx ? aIdx - bIdx : a[0].localeCompare(b[0]);
    });
    for (const [siloName, siloRows] of orderedEntries) {
      addSheet(siloName, siloRows);
    }
    if (siloGroups.size === 0) workbook.addWorksheet('No data');
  } else {
    addSheet('All Silos', filtered);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
