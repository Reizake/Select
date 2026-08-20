// src/lib/export/perspectives/status.ts — server-only
import ExcelJS from 'exceljs';
import type { ExportConfig, ExportStatus } from '../config';
import { COLUMN_REGISTRY, DEFAULT_COLUMNS, type ExportRow, type ColumnKey } from '../data';
import { buildTableSheet, sanitizeSheetName } from './_table';

const STATUS_ORDER: ExportStatus[] = ['Filled', 'Assigned', 'Recommended'];

export async function buildStatusPerspective(
  rows: ExportRow[],
  config: ExportConfig,
): Promise<Buffer> {
  const colKeys: ColumnKey[] = (
    config.columns.length > 0 ? config.columns : DEFAULT_COLUMNS
  ).filter((k): k is ColumnKey => k in COLUMN_REGISTRY);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Selection Board';
  workbook.created = new Date();

  let sheetIndex = 0;
  const addSheet = (status: ExportStatus) => {
    const sheetRows = rows.filter(r => r.status === status);
    const ws = workbook.addWorksheet(sanitizeSheetName(status));
    buildTableSheet({
      worksheet: ws,
      colKeys,
      rows: sheetRows,
      tableName: `Status_${sheetIndex++}`,
      formatting: config.formatting,
    });
  };

  if (config.onePerSheet) {
    const included = STATUS_ORDER.filter(s => config.statusFilter.includes(s));
    for (const status of included) addSheet(status);
    if (included.length === 0) workbook.addWorksheet('No data');
  } else {
    // All filtered rows on one sheet
    const sheetRows = rows.filter(r => config.statusFilter.includes(r.status));
    const ws = workbook.addWorksheet('All Statuses');
    buildTableSheet({
      worksheet: ws,
      colKeys,
      rows: sheetRows,
      tableName: 'Status_All',
      formatting: config.formatting,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
