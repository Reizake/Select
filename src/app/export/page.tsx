'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet, Layers, BarChart2, List,
  ArrowLeft, Download, Loader2, CheckSquare, Square,
  AlignLeft,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ExportMeta } from '@/app/api/export/meta/route';
import type { ExportConfig, ExportPerspective, ExportStatus } from '@/lib/export/config';
import { DEFAULT_COLUMNS } from '@/lib/export/data';

// ─── Column catalogue ─────────────────────────────────────────────────────────

type ColKey = string;

interface ColDef { key: ColKey; label: string; defaultOn: boolean; group?: 'name' }

const NAME_COLS: ColDef[] = [
  { key: 'fullName',     label: 'Full name',   defaultOn: false, group: 'name' },
  { key: 'lastName',     label: 'Last name',   defaultOn: true,  group: 'name' },
  { key: 'firstName',    label: 'First name',  defaultOn: true,  group: 'name' },
  { key: 'middle',       label: 'Middle',      defaultOn: false, group: 'name' },
];

const OTHER_COLS: ColDef[] = [
  { key: 'role',          label: 'Role',                    defaultOn: true  },
  { key: 'selectionOrder',label: 'Selection order',         defaultOn: true  },
  { key: 'silo',          label: 'Silo',                    defaultOn: false },
  { key: 'congregation',  label: 'Congregation',            defaultOn: true  },
  { key: 'status',        label: 'Status',                  defaultOn: true  },
  { key: 'age',           label: 'Age',                     defaultOn: true  },
  { key: 'location',      label: 'Location',                defaultOn: true  },
  { key: 'cellPhone',     label: 'Cell phone',              defaultOn: true  },
  { key: 'personalEmail', label: 'Personal email',          defaultOn: true  },
  { key: 'jwpubEmail',    label: 'JWPUB email',             defaultOn: true  },
  { key: 'bethelEmail',   label: 'Bethel email',            defaultOn: false },
  { key: 'current',       label: 'Current responsibilities', defaultOn: true  },
  { key: 'circuit',       label: 'Circuit responsibilities', defaultOn: false },
  { key: 'experience',    label: 'Regional experience',     defaultOn: false },
  { key: 'order',         label: 'Order',                   defaultOn: false },
  { key: 'filled',        label: 'Filled',                  defaultOn: false },
  { key: 'comments',      label: 'Comments',                defaultOn: false },
  { key: 'coComments',    label: 'CO comments',             defaultOn: false },
];

const ALL_COLS: ColDef[] = [...NAME_COLS, ...OTHER_COLS];
const CANONICAL_ORDER: ColKey[] = ALL_COLS.map(c => c.key);
const COL_LABEL: Record<string, string> = Object.fromEntries(ALL_COLS.map(c => [c.key, c.label]));
const NAME_COL_KEYS = new Set<string>(NAME_COLS.map(c => c.key));

const ALL_STATUS: ExportStatus[] = ['Filled', 'Assigned', 'Recommended'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function defaultFileName(p: ExportPerspective) {
  return `selection-board-by-${p}-${todayStr()}.xlsx`;
}
function initCols(): Set<ColKey> {
  return new Set(DEFAULT_COLUMNS as ColKey[]);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortableChip({ id, on, onClick, label, isNameCol }: {
  id: string; on: boolean; onClick: () => void; label: string; isNameCol: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`touch-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors select-none cursor-grab active:cursor-grabbing ${
        on
          ? 'bg-sound-500 border-sound-500 text-white'
          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
      }`}
    >
      {on ? <CheckSquare className="h-3.5 w-3.5 shrink-0" /> : <Square className="h-3.5 w-3.5 shrink-0" />}
      {label}
      {isNameCol && <AlignLeft className="h-3 w-3 shrink-0 opacity-40" />}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors select-none ${
        on
          ? 'bg-sound-500 border-sound-500 text-white'
          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
      }`}
    >
      {on ? <CheckSquare className="h-3.5 w-3.5 shrink-0" /> : <Square className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </button>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{children}</p>;
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
      <div className="text-2xl font-bold text-sound-500 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  // ── Meta ──────────────────────────────────────────────────────────────────
  const [meta, setMeta] = useState<ExportMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/export/meta')
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Failed')))
      .then(setMeta)
      .catch(e => setMetaError(String(e)));
  }, []);

  // ── Perspective ───────────────────────────────────────────────────────────
  const [perspective, setPerspective] = useState<ExportPerspective>('silo');

  // ── Per-perspective state ─────────────────────────────────────────────────
  const [selectedSilos, setSelectedSilos] = useState<Set<string>>(new Set());
  const [onePerSheet, setOnePerSheet] = useState(true);
  // statusFilter is shared (used by silo + role)
  const [statusFilter, setStatusFilter] = useState<Set<ExportStatus>>(new Set(['Filled', 'Assigned'] as ExportStatus[]));
  // By status: which statuses become sheets
  const [statusSheets, setStatusSheets] = useState<Set<ExportStatus>>(new Set(['Filled', 'Assigned'] as ExportStatus[]));
  // By role detail toggles
  const [roleDescription, setRoleDescription]       = useState(false);
  const [roleQualities, setRoleQualities]           = useState(false);
  const [roleProximityScore, setRoleProximityScore] = useState(false);

  // ── Column state ──────────────────────────────────────────────────────────
  const [selectedCols, setSelectedCols] = useState<Set<ColKey>>(initCols);
  // columnOrder persists across perspective switches (it's a UI preference, not per-perspective)
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(CANONICAL_ORDER);

  // ── Formatting ────────────────────────────────────────────────────────────
  const [fmtTable, setFmtTable]   = useState(true);
  const [fmtColors, setFmtColors] = useState(true);
  const [fmtFreeze, setFmtFreeze] = useState(true);

  // ── File name ─────────────────────────────────────────────────────────────
  const [fileName, setFileName]       = useState(() => defaultFileName('silo'));
  const [fileNameEdited, setFileNameEdited] = useState(false);

  // ── DND sensors ───────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleColDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder(prev => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  // When perspective changes, reset per-perspective state and auto-update filename.
  // columnOrder is intentionally NOT reset here.
  const switchPerspective = useCallback((p: ExportPerspective) => {
    setPerspective(p);
    setStatusFilter(new Set(['Filled', 'Assigned'] as ExportStatus[]));
    setStatusSheets(new Set(['Filled', 'Assigned'] as ExportStatus[]));
    setOnePerSheet(true);
    setRoleDescription(false);
    setRoleQualities(false);
    setRoleProximityScore(false);
    if (!fileNameEdited) setFileName(defaultFileName(p));
  }, [fileNameEdited]);

  // Initialise selectedSilos once meta loads — Core excluded by default
  useEffect(() => {
    if (meta) setSelectedSilos(new Set(meta.silos.filter(s => s.name.toLowerCase() !== 'core').map(s => s.name)));
  }, [meta]);

  // ── Derived summary ───────────────────────────────────────────────────────
  const sheetCount = perspective === 'silo'
    ? (onePerSheet ? selectedSilos.size : 1)
    : perspective === 'status'
    ? statusSheets.size
    : 1;

  const { derivedRoles, derivedCandidates } = (() => {
    if (!meta) return { derivedRoles: '—', derivedCandidates: '—' };
    if (perspective === 'silo') {
      const sel = meta.silos.filter(s => selectedSilos.has(s.name));
      return {
        derivedRoles: sel.reduce((a, s) => a + s.roleCount, 0),
        derivedCandidates: sel.reduce((a, s) =>
          a + (Object.entries(s.statusCounts) as [ExportStatus, number][])
            .filter(([st]) => statusFilter.has(st))
            .reduce((b, [, n]) => b + n, 0), 0),
      };
    }
    if (perspective === 'status') {
      return {
        derivedRoles: meta.totalRankedRoles,
        derivedCandidates: Object.entries(meta.statusCounts)
          .filter(([s]) => statusSheets.has(s as ExportStatus))
          .reduce((a, [, n]) => a + n, 0),
      };
    }
    return {
      derivedRoles: meta.totalRankedRoles,
      derivedCandidates: (Object.entries(meta.statusCounts) as [ExportStatus, number][])
        .filter(([st]) => statusFilter.has(st))
        .reduce((a, [, n]) => a + n, 0),
    };
  })();

  // Active column keys in user-defined order (not canonical)
  const activeColKeys = columnOrder.filter(k => selectedCols.has(k));
  // Add role-header keys for By Role (these come from separate toggles, not columnOrder)
  const roleHeaderCols = [
    ...(roleDescription    ? ['description']    : []),
    ...(roleQualities      ? ['qualities']      : []),
    ...(roleProximityScore ? ['proximityScore'] : []),
  ];
  const finalCols = perspective === 'role'
    ? [...roleHeaderCols, ...activeColKeys]
    : activeColKeys;

  const sheetNames =
    perspective === 'silo'   ? (onePerSheet ? meta?.silos.filter(s => selectedSilos.has(s.name)).map(s => s.name) ?? [] : ['All Silos'])
    : perspective === 'status' ? ALL_STATUS.filter(s => statusSheets.has(s))
    : ['Selection order'];

  // ── Validation ────────────────────────────────────────────────────────────
  const validationMsg =
    finalCols.length === 0        ? 'Select at least one column.'
    : perspective === 'silo' && selectedSilos.size === 0 ? 'Select at least one silo.'
    : perspective === 'status' && statusSheets.size === 0 ? 'Select at least one status.'
    : (perspective === 'silo' || perspective === 'role') && statusFilter.size === 0 ? 'Select at least one status to include.'
    : null;

  // ── Export action ─────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const config: ExportConfig = {
        perspective,
        columns: finalCols,
        statusFilter: perspective === 'status'
          ? [...statusSheets]
          : [...statusFilter],
        silos: perspective === 'silo' ? [...selectedSilos] : undefined,
        onePerSheet,
        formatting: { excelTable: fmtTable, statusColors: fmtColors, freezeHeader: fmtFreeze },
        fileName,
      };
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const detail = await res.text();
        setExportError(`Export failed: ${detail}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(String(e));
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const perspectives: { key: ExportPerspective; icon: React.ReactNode; title: string; desc: string }[] = [
    { key: 'silo',   icon: <Layers className="h-5 w-5" />,    title: 'By Silo',   desc: 'One sheet per silo; candidates grouped by their role silo.' },
    { key: 'status', icon: <BarChart2 className="h-5 w-5" />, title: 'By Status', desc: 'One sheet per status: Recommended, Assigned, Filled.' },
    { key: 'role',   icon: <List className="h-5 w-5" />,      title: 'By Role',   desc: 'Single sheet; sections in selection order with candidate rows.' },
  ];

  const toggleSet = <T,>(set: Set<T>, item: T): Set<T> => {
    const next = new Set(set);
    next.has(item) ? next.delete(item) : next.add(item);
    return next;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to board
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sound-500 rounded-xl text-white">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Export to Excel</h1>
              <p className="text-slate-500 text-sm">Configure and download a candidate recommendation spreadsheet.</p>
            </div>
          </div>
        </div>

        {/* Meta loading */}
        {!meta && !metaError && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading data…
          </div>
        )}
        {metaError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-6">
            Failed to load export metadata: {metaError}
          </div>
        )}

        {meta && (
          <>
            {/* Perspective picker */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Perspective</p>
              <div className="grid grid-cols-3 gap-3">
                {perspectives.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => switchPerspective(p.key)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      perspective === p.key
                        ? 'border-sound-500 bg-sound-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`mb-2 ${perspective === p.key ? 'text-sound-500' : 'text-slate-400'}`}>{p.icon}</div>
                    <div className="font-semibold text-slate-900 text-sm">{p.title}</div>
                    <div className="text-slate-500 text-xs mt-0.5 leading-snug">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-[1.5fr_1fr] gap-6 items-start">

              {/* LEFT — config */}
              <div className="space-y-4">

                {/* Per-perspective options */}
                <Card>
                  <SectionLabel>
                    {perspective === 'silo' ? 'Silo options' : perspective === 'status' ? 'Status options' : 'Role options'}
                  </SectionLabel>

                  {perspective === 'silo' && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Silos to include</p>
                        <div className="flex flex-wrap gap-2">
                          {meta.silos.map(s => (
                            <Chip key={s.name} on={selectedSilos.has(s.name)} onClick={() => setSelectedSilos(prev => toggleSet(prev, s.name))}>
                              {s.name} <span className="opacity-60 text-xs">({s.roleCount})</span>
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Status to include</p>
                        <div className="flex flex-wrap gap-2">
                          {ALL_STATUS.map(s => (
                            <Chip key={s} on={statusFilter.has(s)} onClick={() => setStatusFilter(prev => toggleSet(prev, s))}>{s}</Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Sheet layout</p>
                        <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
                          {[{ v: true, l: 'One sheet per silo' }, { v: false, l: 'Single grouped sheet' }].map(({ v, l }) => (
                            <button key={String(v)} type="button" onClick={() => setOnePerSheet(v)}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${onePerSheet === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {perspective === 'status' && (
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">Statuses to export (one sheet each)</p>
                      <div className="flex flex-wrap gap-2">
                        {ALL_STATUS.map(s => (
                          <Chip key={s} on={statusSheets.has(s)} onClick={() => setStatusSheets(prev => toggleSet(prev, s))}>
                            {s} <span className="opacity-60 text-xs">({meta.statusCounts[s]})</span>
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}

                  {perspective === 'role' && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Status to include</p>
                        <div className="flex flex-wrap gap-2">
                          {ALL_STATUS.map(s => (
                            <Chip key={s} on={statusFilter.has(s)} onClick={() => setStatusFilter(prev => toggleSet(prev, s))}>{s}</Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Role detail in section headers</p>
                        <div className="flex flex-wrap gap-2">
                          <Chip on={roleDescription}    onClick={() => setRoleDescription(v => !v)}>Description</Chip>
                          <Chip on={roleQualities}      onClick={() => setRoleQualities(v => !v)}>Qualities needed</Chip>
                          <Chip on={roleProximityScore} onClick={() => setRoleProximityScore(v => !v)}>Proximity score</Chip>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Columns */}
                <Card>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Columns</p>
                    <button
                      type="button"
                      onClick={() => setColumnOrder(CANONICAL_ORDER)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Reset order
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Click to toggle · Drag to reorder</p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
                    <SortableContext items={columnOrder} strategy={rectSortingStrategy}>
                      <div className="flex flex-wrap gap-2">
                        {columnOrder.map(key => (
                          <SortableChip
                            key={key}
                            id={key}
                            on={selectedCols.has(key)}
                            onClick={() => setSelectedCols(prev => toggleSet(prev, key))}
                            label={COL_LABEL[key] ?? key}
                            isNameCol={NAME_COL_KEYS.has(key)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </Card>

                {/* Formatting */}
                <Card>
                  <SectionLabel>Formatting</SectionLabel>
                  <div className="space-y-3">
                    {[
                      { val: fmtTable,  set: setFmtTable,  label: 'Excel table (filters + banding)', roleHidden: true },
                      { val: fmtColors, set: setFmtColors, label: 'Status color coding',              roleHidden: false },
                      { val: fmtFreeze, set: setFmtFreeze, label: 'Freeze header row',                roleHidden: true },
                    ].filter(t => !(perspective === 'role' && t.roleHidden)).map(({ val, set, label }) => (
                      <label key={label} className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-sound-500 focus:ring-sound-500 focus:ring-2" />
                        <span className="text-sm text-slate-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </Card>

                {/* File name */}
                <Card>
                  <SectionLabel>File name</SectionLabel>
                  <input
                    type="text"
                    value={fileName}
                    onChange={e => { setFileName(e.target.value); setFileNameEdited(true); }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </Card>
              </div>

              {/* RIGHT — summary (sticky) */}
              <div className="sticky top-6 space-y-4">
                <Card>
                  <SectionLabel>Summary</SectionLabel>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <MetricCard label="Sheets"     value={sheetCount} />
                    <MetricCard label="Columns"    value={finalCols.length} />
                    <MetricCard label="Roles"      value={derivedRoles} />
                    <MetricCard label="Candidates" value={derivedCandidates} />
                  </div>

                  {sheetNames.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Sheets to generate</p>
                      <ul className="space-y-1">
                        {sheetNames.map(name => (
                          <li key={name} className="flex items-center gap-2 text-sm text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-sound-400 shrink-0" />
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>

                {/* Export button */}
                <div className="space-y-2">
                  {validationMsg && (
                    <p className="text-xs text-amber-600 text-center">{validationMsg}</p>
                  )}
                  {exportError && (
                    <p className="text-xs text-red-600 text-center">{exportError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={!!validationMsg || exporting}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-sound-500 text-white text-base font-semibold rounded-xl hover:bg-sound-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exporting
                      ? <><Loader2 className="h-5 w-5 animate-spin" /> Generating…</>
                      : <><Download className="h-5 w-5" /> Export</>
                    }
                  </button>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
