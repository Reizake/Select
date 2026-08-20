// src/components/board/SelectionOrderView.tsx
'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { X, CheckCircle, Circle, Target, Rows2, Rows3, Rows4, Search, Users } from 'lucide-react';
import type { Role, RoleDecision, Candidate } from '@/types';
import { FormattedRoleTitle } from '@/components/board/FormattedRoleTitle';
import { siloColors, siloBadgeColors } from '@/lib/siloMeta';
export { siloColors, siloBadgeColors } from '@/lib/siloMeta';

type View    = 'all' | 'remaining' | 'filled';
type Density = 'compact' | 'comfortable' | 'detailed';

interface SelectionOrderViewProps {
  roles: Role[];
  roleDecisions: RoleDecision[];
  candidates: Candidate[];
  roleMatchTotals?: Record<string, number>;
  onClose: () => void;
  onSelectRole: (roleId: string) => void;
}


function readStoredView(): View {
  if (typeof window === 'undefined') return 'remaining';
  const v = localStorage.getItem('selectionOrderView');
  if (v === 'all' || v === 'remaining' || v === 'filled') return v;
  return 'remaining';
}

function readStoredDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable';
  const v = localStorage.getItem('selectionOrderDensity');
  if (v === 'compact' || v === 'comfortable' || v === 'detailed') return v;
  // First open: pick by viewport width
  return window.innerWidth < 640 ? 'compact' : 'comfortable';
}

// Static class strings so Tailwind's scanner sees complete utility names.
const descriptionClass: Record<Density, string> = {
  compact:     '',
  comfortable: 'text-sm text-slate-600 mb-1 line-clamp-2',
  detailed:    'text-sm text-slate-600 mb-1',
};
const qualitiesClass: Record<Density, string> = {
  compact:     '',
  comfortable: 'text-xs text-slate-500 line-clamp-1',
  detailed:    'text-xs text-slate-500',
};

export function SelectionOrderView({
  roles,
  roleDecisions,
  candidates,
  roleMatchTotals,
  onClose,
  onSelectRole,
}: SelectionOrderViewProps) {
  const [view,    setView]    = useState<View>(readStoredView);
  const [density, setDensity] = useState<Density>(readStoredDensity);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const scrollRef     = useRef<HTMLDivElement>(null);
  const anchorRef     = useRef<string | null>(null);
  const anchorTopRef  = useRef<number>(0); // card's px offset from container top before density change
  const searchRef     = useRef<HTMLInputElement>(null);

  const decisionMap  = new Map(roleDecisions.map(d => [d.role_id, d]));
  const candidateMap = new Map(candidates.map(c => [c.id, c]));

  const rankedRoles = [...roles]
    .filter(r => r.selection_order != null)
    .sort((a, b) => (a.selection_order ?? 999) - (b.selection_order ?? 999));

  const allCount       = rankedRoles.length;
  const filledCount    = rankedRoles.filter(r => decisionMap.get(r.id)?.status === 'filled').length;
  const unassignedCount = rankedRoles.filter(r => !decisionMap.get(r.id)?.selected_candidate_id).length;

  const viewFilteredRoles = rankedRoles.filter(r => {
    const filled = decisionMap.get(r.id)?.status === 'filled';
    if (view === 'remaining') return !decisionMap.get(r.id)?.selected_candidate_id;
    if (view === 'filled')    return filled;
    return true;
  });

  const q = search.trim().toLowerCase();
  const filteredRoles = q
    ? viewFilteredRoles.filter(r => {
        const decision  = decisionMap.get(r.id);
        const candidate = decision?.selected_candidate_id
          ? candidateMap.get(decision.selected_candidate_id)
          : undefined;
        const haystack = [
          r.title,
          r.silo?.name ?? '',
          r.description ?? '',
          r.qualities ?? '',
          candidate?.full_name ?? '',
          String(r.selection_order ?? ''),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      })
    : viewFilteredRoles;

  const handleViewChange = (v: View) => {
    setView(v);
    localStorage.setItem('selectionOrderView', v);
  };

  const handleDensityChange = (d: Density) => {
    if (scrollRef.current && scrollRef.current.scrollTop > 0) {
      const container    = scrollRef.current;
      const containerTop = container.getBoundingClientRect().top;
      const cards = container.querySelectorAll<HTMLElement>('[data-role-id]');
      for (const card of cards) {
        const cardTop = card.getBoundingClientRect().top;
        if (cardTop >= containerTop) {
          anchorRef.current    = card.dataset.roleId ?? null;
          anchorTopRef.current = cardTop - containerTop; // preserve exact viewport offset
          break;
        }
      }
    } else {
      anchorRef.current = null;
    }
    setDensity(d);
    localStorage.setItem('selectionOrderDensity', d);
  };

  // Restore the anchored card to its exact pre-change viewport offset. Runs before
  // paint to avoid a flash.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !scrollRef.current) return;
    anchorRef.current = null;

    const container = scrollRef.current;
    const card = container.querySelector<HTMLElement>(`[data-role-id="${anchor}"]`);
    if (!card) { container.scrollTop = 0; return; }

    container.scrollTop = Math.max(
      0,
      Math.min(card.offsetTop - anchorTopRef.current, container.scrollHeight - container.clientHeight),
    );
  }, [density]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [search]);

  const viewTabs = [
    { value: 'remaining' as View, label: 'Unassigned', count: unassignedCount, Icon: Target,      iconClassName: '' },
    { value: 'all'       as View, label: 'All',       count: allCount,       Icon: Circle,      iconClassName: 'fill-current' },
    { value: 'filled'    as View, label: 'Filled',    count: filledCount,    Icon: CheckCircle, iconClassName: 'text-forest-400' },
  ];

  const densityTabs = [
    { value: 'compact'     as Density, label: 'Compact',     Icon: Rows4 },
    { value: 'comfortable' as Density, label: 'Comfortable', Icon: Rows3 },
    { value: 'detailed'    as Density, label: 'Detailed',    Icon: Rows2 },
  ];

  const segmentBase  = 'inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5';
  const tabActive    = 'bg-white text-slate-900 shadow-sm';
  const tabInactive  = 'text-slate-500 hover:text-slate-700';
  const tabBase      = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all';
  const iconTabBase  = 'flex items-center px-2.5 py-1.5 rounded-md transition-all';

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50"
      style={{
        paddingTop: 'max(0px, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0px, env(safe-area-inset-left))',
        paddingRight: 'max(0px, env(safe-area-inset-right))',
      }}
    >
      <div className="bg-white shadow-2xl max-w-4xl w-full max-h-[100dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col rounded-none sm:rounded-xl">

        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          {/* Title + close */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-slate-900">Roles</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Controls row — tab groups row + search row on mobile, single row on sm+ */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">

            {/* Tab-group wrapper: real flex child on mobile, transparent on sm+ */}
            <div className="flex items-center justify-between gap-2 sm:contents">
              <div className={`${segmentBase} sm:order-1`}>
                {viewTabs.map(({ value, label, count, Icon, iconClassName }) => (
                  <button
                    key={value}
                    title={label}
                    aria-label={`${label} roles, ${count}`}
                    onClick={() => handleViewChange(value)}
                    className={`${iconTabBase} ${view === value ? tabActive : tabInactive}`}
                  >
                    <Icon className={`h-4 w-4${iconClassName ? ` ${iconClassName}` : ''}`} />
                    <span className={`text-xs tabular-nums ${view === value ? 'text-slate-400' : 'text-slate-400/70'}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Density icons */}
              <div className={`${segmentBase} sm:order-3`}>
                {densityTabs.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    title={label}
                    aria-label={`${label} view`}
                    onClick={() => handleDensityChange(value)}
                    className={`${iconTabBase} ${density === value ? tabActive : tabInactive}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Search — own row on mobile, inline flex-1 on sm+ */}
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:order-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape' && search) {
                    e.stopPropagation();
                    setSearch('');
                  }
                }}
                placeholder="Search…"
                aria-label="Search by role, silo, description, or candidate"
                className="w-full pl-8 pr-8 py-1.5 text-base sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 placeholder:text-slate-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Role list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredRoles.length === 0 ? (
            <div className="text-center py-12">
              {q ? (
                <>
                  <p className="text-slate-600">No roles match &ldquo;{search.trim()}&rdquo;</p>
                  <button
                    onClick={() => setSearch('')}
                    className="mt-2 text-sm text-slate-500 underline hover:text-slate-700"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  {view === 'remaining' && (
                    <p className="text-slate-700 text-lg font-medium">All roles assigned 🎉</p>
                  )}
                  {view === 'filled' && (
                    <p className="text-slate-600">
                      No roles filled yet. Selection order is set; start assigning candidates from the main board.
                    </p>
                  )}
                  {view === 'all' && (
                    <p className="text-slate-600">No roles configured.</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRoles.map((role) => {
                const siloName   = role.silo?.name ?? 'Other';
                const colorClass  = siloColors[siloName] ?? 'bg-slate-50 border-slate-200';
                const badgeClass  = siloBadgeColors[siloName] ?? 'border-slate-300 text-slate-600';
                const decision   = decisionMap.get(role.id);
                const filled     = decision?.status === 'filled';
                const candidate  = decision?.selected_candidate_id
                  ? candidateMap.get(decision.selected_candidate_id)
                  : undefined;

                return (
                  <button
                    key={role.id}
                    data-role-id={role.id}
                    onClick={() => { onSelectRole(role.id); onClose(); }}
                    className={`w-full text-left px-3 py-2 sm:px-4 sm:py-3 rounded-lg border-2 ${colorClass} hover:shadow-md transition-all ${
                      filled && view === 'all' ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">

                        {/* Selection Order Badge */}
                        <div className="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-lg border-2 border-slate-300 flex items-center justify-center">
                          <span className="text-base sm:text-xl font-bold text-slate-700">
                            {role.selection_order}
                          </span>
                        </div>

                        {/* Role Details */}
                        <div className="flex-1 min-w-0">
                          {filled ? (
                            // All densities: title+silo on line 1, candidate on line 2.
                            // Compactness for filled cards comes from shorter py on the outer button.
                            <>
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <h3 className="font-bold text-slate-900 text-sm sm:text-base"><FormattedRoleTitle title={role.title} /></h3>
                                <span className={`px-2 py-0.5 bg-white text-xs font-medium rounded border shrink-0 ${badgeClass}`}>
                                  {siloName}
                                </span>
                                {roleMatchTotals !== undefined && (
                                  <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 text-xs shrink-0">
                                    <Users className="h-3 w-3" />{roleMatchTotals[role.id] ?? 0}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                <CheckCircle className="h-3.5 w-3.5 text-forest-400 shrink-0" />
                                <span>{candidate?.full_name ?? 'Unknown'}</span>
                              </div>
                            </>
                          ) : (
                            // Open role
                            <>
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h3 className="font-bold text-slate-900 text-sm sm:text-base"><FormattedRoleTitle title={role.title} /></h3>
                                <span className={`px-2 py-0.5 bg-white text-xs font-medium rounded border shrink-0 ${badgeClass}`}>
                                  {siloName}
                                </span>
                                {roleMatchTotals !== undefined && (
                                  <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 text-xs shrink-0">
                                    <Users className="h-3 w-3" />{roleMatchTotals[role.id] ?? 0}
                                  </span>
                                )}
                              </div>
                              {density !== 'compact' && role.description && (
                                <p className={descriptionClass[density]}>
                                  {role.description}
                                </p>
                              )}
                              {density !== 'compact' && role.qualities && (
                                <p className={qualitiesClass[density]}>
                                  <span className="font-medium">Qualities:</span> {role.qualities}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Click indicator */}
                      <div className="flex-shrink-0 text-slate-400 self-center">
                        <span className="hidden sm:inline text-xs">Click to view →</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
