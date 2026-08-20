// src/lib/export/config.ts
export type ExportStatus = 'Recommended' | 'Assigned' | 'Filled';
export type ExportPerspective = 'silo' | 'status' | 'role';

export interface ExportConfig {
  perspective: ExportPerspective;
  columns: string[];           // logical column keys from COLUMN_REGISTRY
  statusFilter: ExportStatus[];
  silos?: string[];            // silo perspective: names of silos to include (all if omitted)
  onePerSheet: boolean;
  formatting: {
    excelTable: boolean;
    statusColors: boolean;
    freezeHeader: boolean;
  };
  fileName: string;
}

export const DEFAULT_CONFIG: ExportConfig = {
  perspective: 'silo',
  columns: [],   // filled by route with DEFAULT_COLUMNS when empty
  statusFilter: ['Recommended', 'Assigned', 'Filled'],
  onePerSheet: true,
  formatting: { excelTable: true, statusColors: true, freezeHeader: true },
  fileName: 'selection-board-export.xlsx',
};
