// src/lib/export/data.ts — server-only, never import in client components
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Raw DB shapes ────────────────────────────────────────────────────────────

interface DbSilo { id: string; name: string; display_order?: number; }
interface DbRole {
  id: string; silo_id: string; title: string;
  description?: string; qualities?: string;
  selection_order?: number; proximity_score?: number;
  silo?: DbSilo;
}
interface DbMatch {
  id: string; candidate_id: string; role_id: string;
  sort_order?: number; sort_key?: string | null;
}
interface DbDecision {
  id: string; role_id: string;
  selected_candidate_id?: string;
  status: 'open' | 'in_progress' | 'filled';
}
interface DbCandidate {
  id: string; full_name: string; age?: number;
  congregation?: string; location?: string;
  cell_phone?: string | null; personal_email?: string | null;
  jwpub_email?: string | null; bethel_email?: string | null;
  current_responsibilities?: string; circuit_responsibilities?: string;
  experience?: string; comments?: string; co_comments?: string;
  roles?: (DbMatch & { role?: DbRole })[];
}

// ─── Row model ────────────────────────────────────────────────────────────────

export interface ExportRow {
  // role fields
  roleId: string;
  roleTitle: string;
  roleSelectionOrder: number | null;
  roleSiloId: string;
  roleSiloName: string;
  roleDescription: string;
  roleQualities: string;
  roleProximityScore: number | null;
  // candidate fields
  candidateId: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middle: string;
  congregation: string;
  age: number | null;
  location: string;
  cellPhone: string;
  personalEmail: string;
  jwpubEmail: string;
  bethelEmail: string;
  current: string;
  circuit: string;
  experience: string;
  comments: string;
  coComments: string;
  // derived
  order: number;   // rank within this role's recommendation list
  status: 'Recommended' | 'Assigned' | 'Filled';
  assignedRole: string;  // candidate-scoped: title of the role they're assigned to
  filled: 'Yes' | 'No'; // candidate-scoped: whether that assignment is filled
}

// ─── Name parser ──────────────────────────────────────────────────────────────

function parseName(fullName: string): { lastName: string; firstName: string; middle: string } {
  const comma = fullName.indexOf(',');
  if (comma === -1) return { lastName: fullName.trim(), firstName: '', middle: '' };
  const lastName  = fullName.slice(0, comma).trim();
  const rest      = fullName.slice(comma + 1).trim();
  const tokens    = rest.split(/\s+/);
  const firstName = tokens[0] ?? '';
  const middle    = tokens.slice(1).join(' ');
  return { lastName, firstName, middle };
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

// Mirrors the board page's select shapes exactly:
//   candidates: `*, roles:candidate_role_matches(*, role:roles(*, silo:silos(*)))`
//   roles:      `*, silo:silos(*)`
//   role_decisions: `*`
export async function fetchExportData(supabase: SupabaseClient) {
  const pageSize = 1000;

  // Paginated candidates (same as board's reloadAllCandidates)
  let allCandidates: DbCandidate[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('candidates')
      .select(`*, roles:candidate_role_matches(*, role:roles(*, silo:silos(*)))`)
      .order('full_name')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`candidates fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    allCandidates = allCandidates.concat(data as DbCandidate[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const [{ data: rolesData, error: rolesErr }, { data: decisionsData, error: decisionsErr }] =
    await Promise.all([
      supabase.from('roles').select('*, silo:silos(*)').order('selection_order'),
      supabase.from('role_decisions').select('*'),
    ]);

  if (rolesErr)     throw new Error(`roles fetch: ${rolesErr.message}`);
  if (decisionsErr) throw new Error(`decisions fetch: ${decisionsErr.message}`);

  const roles:     DbRole[]     = (rolesData     ?? []) as DbRole[];
  const decisions: DbDecision[] = (decisionsData ?? []) as DbDecision[];

  return buildRows(allCandidates, roles, decisions);
}

// ─── Row builder ──────────────────────────────────────────────────────────────

function buildRows(
  candidates: DbCandidate[],
  roles: DbRole[],
  decisions: DbDecision[],
): ExportRow[] {
  const decisionByRole = new Map(decisions.map(d => [d.role_id, d]));
  const rolesById      = new Map(roles.map(r => [r.id, r]));

  // Candidate-scoped assignment info (which role is this candidate assigned to, across ALL decisions)
  const candidateAssignment = new Map<string, { roleTitle: string; filled: boolean }[]>();
  for (const d of decisions) {
    if (!d.selected_candidate_id) continue;
    const role = rolesById.get(d.role_id);
    if (!role) continue;
    const arr = candidateAssignment.get(d.selected_candidate_id) ?? [];
    arr.push({ roleTitle: role.title, filled: d.status === 'filled' });
    candidateAssignment.set(d.selected_candidate_id, arr);
  }

  // Per-role rank map: sort matches by sort_order (same heuristic as the board)
  const roleMatchesSorted = new Map<string, { candidateId: string; rank: number }[]>();
  for (const c of candidates) {
    for (const rm of c.roles ?? []) {
      if (!rm.role_id) continue;
      const arr = roleMatchesSorted.get(rm.role_id) ?? [];
      arr.push({ candidateId: c.id, _sortOrder: rm.sort_order ?? Number.MAX_SAFE_INTEGER } as any);
      roleMatchesSorted.set(rm.role_id, arr);
    }
  }
  // Sort and assign ranks
  const roleRankMap = new Map<string, Map<string, number>>();
  for (const [roleId, entries] of roleMatchesSorted) {
    const sorted = [...entries].sort((a, b) => (a as any)._sortOrder - (b as any)._sortOrder);
    const innerMap = new Map<string, number>();
    sorted.forEach((e, i) => innerMap.set(e.candidateId, i + 1));
    roleRankMap.set(roleId, innerMap);
  }

  const rows: ExportRow[] = [];
  for (const c of candidates) {
    const { lastName, firstName, middle } = parseName(c.full_name);
    const assignments = candidateAssignment.get(c.id) ?? [];
    const assignedRole = assignments.map(a => a.roleTitle).join(', ');
    const filledFlag   = assignments.some(a => a.filled) ? 'Yes' : 'No';

    for (const rm of c.roles ?? []) {
      const role = rm.role ? (rm.role as DbRole) : rolesById.get(rm.role_id);
      if (!role) continue;
      const decision = decisionByRole.get(rm.role_id);
      const isSelected = decision?.selected_candidate_id === c.id;

      let status: ExportRow['status'];
      if (isSelected && decision?.status === 'filled') status = 'Filled';
      else if (isSelected) status = 'Assigned';
      else status = 'Recommended';

      const order = roleRankMap.get(rm.role_id)?.get(c.id) ?? 0;

      rows.push({
        roleId:             role.id,
        roleTitle:          role.title,
        roleSelectionOrder: role.selection_order ?? null,
        roleSiloId:         role.silo_id,
        roleSiloName:       role.silo?.name ?? '',
        roleDescription:    role.description ?? '',
        roleQualities:      role.qualities ?? '',
        roleProximityScore: role.proximity_score ?? null,
        candidateId:        c.id,
        fullName:           c.full_name,
        lastName, firstName, middle,
        congregation:       c.congregation ?? '',
        age:                c.age ?? null,
        location:           c.location ?? '',
        cellPhone:          c.cell_phone ?? '',
        personalEmail:      c.personal_email ?? '',
        jwpubEmail:         c.jwpub_email ?? '',
        bethelEmail:        c.bethel_email ?? '',
        current:            c.current_responsibilities ?? '',
        circuit:            c.circuit_responsibilities ?? '',
        experience:         c.experience ?? '',
        comments:           c.comments ?? '',
        coComments:         c.co_comments ?? '',
        order,
        status,
        assignedRole,
        filled: filledFlag,
      });
    }
  }

  return rows;
}

// ─── Column registry ──────────────────────────────────────────────────────────

export type ColumnKey = keyof typeof COLUMN_REGISTRY;

export const COLUMN_REGISTRY = {
  // Role-identifying columns (excluded from By Role per-row output; used in section headers)
  role:           { header: 'Role',               accessor: (r: ExportRow) => r.roleTitle },
  selectionOrder: { header: 'Selection order',    accessor: (r: ExportRow) => r.roleSelectionOrder ?? '' },
  silo:           { header: 'Silo',               accessor: (r: ExportRow) => r.roleSiloName },
  // By-Role header-block columns — row accessors available but role.ts renders them in headers
  description:    { header: 'Description',        accessor: (r: ExportRow) => r.roleDescription },
  qualities:      { header: 'Qualities needed',   accessor: (r: ExportRow) => r.roleQualities },
  proximityScore: { header: 'Proximity score',    accessor: (r: ExportRow) => r.roleProximityScore ?? '' },
  // Candidate columns
  fullName:       { header: 'Full name',          accessor: (r: ExportRow) => r.fullName },
  lastName:       { header: 'Last name',          accessor: (r: ExportRow) => r.lastName },
  firstName:      { header: 'First name',         accessor: (r: ExportRow) => r.firstName },
  middle:         { header: 'Middle',             accessor: (r: ExportRow) => r.middle },
  congregation:   { header: 'Congregation',       accessor: (r: ExportRow) => r.congregation },
  status:         { header: 'Status',             accessor: (r: ExportRow) => r.status },
  age:            { header: 'Age',                accessor: (r: ExportRow) => r.age ?? '' },
  location:       { header: 'Location',           accessor: (r: ExportRow) => r.location },
  cellPhone:      { header: 'Cell phone',         accessor: (r: ExportRow) => r.cellPhone },
  personalEmail:  { header: 'Personal email',     accessor: (r: ExportRow) => r.personalEmail },
  jwpubEmail:     { header: 'JWPUB email',        accessor: (r: ExportRow) => r.jwpubEmail },
  bethelEmail:    { header: 'Bethel email',       accessor: (r: ExportRow) => r.bethelEmail },
  current:        { header: 'Current responsibilities', accessor: (r: ExportRow) => r.current },
  circuit:        { header: 'Circuit responsibilities', accessor: (r: ExportRow) => r.circuit },
  experience:     { header: 'Regional experience', accessor: (r: ExportRow) => r.experience },
  order:          { header: 'Order',              accessor: (r: ExportRow) => r.order },
  filled:         { header: 'Filled',             accessor: (r: ExportRow) => r.filled },
  comments:       { header: 'Comments',           accessor: (r: ExportRow) => r.comments },
  coComments:     { header: 'CO comments',        accessor: (r: ExportRow) => r.coComments },
} as const;

// Updated defaults include role context so rows are identifiable in flat perspectives
export const DEFAULT_COLUMNS: ColumnKey[] = [
  'role', 'selectionOrder', 'silo', 'lastName', 'firstName', 'congregation', 'status', 'age',
  'location', 'cellPhone', 'personalEmail', 'jwpubEmail', 'current',
];
