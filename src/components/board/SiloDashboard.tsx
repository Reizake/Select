// src/components/board/SiloDashboard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Users, Check, CheckCircle, CircleCheckBig, UserPen } from 'lucide-react';
import type { Silo, Role, RoleDecision, Candidate } from '@/types';
import { FormattedRoleTitle } from '@/components/board/FormattedRoleTitle';
import { siloIcons, siloBadgeColors } from '@/lib/siloMeta';

export { siloIcons } from '@/lib/siloMeta';

interface SiloDashboardProps {
  silos: Silo[];
  roles: Role[];
  roleDecisions: RoleDecision[];
  candidates: Candidate[];
  roleMatchTotals?: Record<string, number>;
  selectedRoleId: string | null;
  onRoleSelect: (roleId: string) => void;
  onAddRole: (siloId: string, title: string, description: string, qualities: string, selectionOrder: number | null) => void;
}

export function SiloDashboard({ silos, roles, roleDecisions, candidates, roleMatchTotals, selectedRoleId, onRoleSelect, onAddRole }: SiloDashboardProps) {
  const [openSiloId, setOpenSiloId] = useState<string | null>(null);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [addRoleSiloId, setAddRoleSiloId] = useState<string>('');
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleQualities, setNewRoleQualities] = useState('');
  const [newRoleSelectionOrder, setNewRoleSelectionOrder] = useState('');
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Exclude CORE - it's in the header button
  const mainSilos = silos.filter(s => s.name !== 'CORE');
  const siloOrder = ['HC1', 'HC2', 'HC3', 'CCC', 'PO', 'RO'];
  const sortedSilos = mainSilos.sort((a, b) => {
    const aIndex = siloOrder.indexOf(a.name);
    const bIndex = siloOrder.indexOf(b.name);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  const getSiloRoles = (siloId: string) => {
    return roles
      .filter(r => r.silo_id === siloId)
      .sort((a, b) => (a.selection_order || 999) - (b.selection_order || 999));
  };

  const getRoleDecision = (roleId: string) => {
    return roleDecisions.find(d => d.role_id === roleId);
  };

  const getSiloStats = (siloId: string) => {
    const siloRoles = getSiloRoles(siloId);
    const siloRoleIds = siloRoles.map(r => r.id);

    const filledCount   = siloRoles.filter(r => getRoleDecision(r.id)?.status === 'filled').length;
    const assignedCount = siloRoles.filter(r => {
      const d = getRoleDecision(r.id);
      return d?.selected_candidate_id && d.status === 'in_progress';
    }).length;

    const rolesWithRecsCount = siloRoles.filter(r => (roleMatchTotals?.[r.id] ?? 0) > 0).length;

    const uniqueCandidateIds = new Set<string>();
    for (const c of candidates) {
      if (c.roles?.some(rm => siloRoleIds.includes(rm.role_id))) {
        uniqueCandidateIds.add(c.id);
      }
    }

    return {
      total: siloRoles.length,
      filledCount,
      assignedCount,
      rolesWithRecsCount,
      uniqueCandidateCount: uniqueCandidateIds.size,
    };
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const clickedOutside = Array.from(dropdownRefs.current.values()).every(
        ref => ref && !ref.contains(event.target as Node)
      );
      if (clickedOutside) {
        setOpenSiloId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSiloClick = (siloId: string) => {
    setOpenSiloId(openSiloId === siloId ? null : siloId);
  };

  const handleRoleClick = (roleId: string) => {
    onRoleSelect(roleId);
    setOpenSiloId(null);
  };

  const handleAddRoleClick = (siloId: string) => {
    setAddRoleSiloId(siloId);
    setShowAddRoleModal(true);
    setOpenSiloId(null);
  };

  const handleSaveNewRole = () => {
    const selectionOrder = newRoleSelectionOrder ? parseInt(newRoleSelectionOrder) : null;
    onAddRole(addRoleSiloId, newRoleTitle, newRoleDescription, newRoleQualities, selectionOrder);
    setShowAddRoleModal(false);
    setNewRoleTitle('');
    setNewRoleDescription('');
    setNewRoleQualities('');
    setNewRoleSelectionOrder('');
  };

  const renderSilo = (silo: Silo) => {
    const stats = getSiloStats(silo.id);
    const siloRoles = getSiloRoles(silo.id);
    const isOpen = openSiloId === silo.id;

    return (
      <div 
        key={silo.id} 
        className="relative"
        ref={el => {
          if (el) dropdownRefs.current.set(silo.id, el);
        }}
      >
        <button
          onClick={() => handleSiloClick(silo.id)}
          className="w-full bg-white rounded-xl border border-slate-200 p-4 hover:bg-slate-50 transition-colors"
        >
          {/* Row 1: icon + name + unique-candidate pill + chevron */}
          <div className="flex items-center gap-3 mb-2">
            {(() => {
              const Icon = siloIcons[silo.name];
              const colorClass = siloBadgeColors[silo.name] ?? 'text-slate-600';
              return Icon ? <Icon className={`h-5 w-5 shrink-0 ${colorClass}`} /> : null;
            })()}
            <h3 className="font-bold text-slate-900">{silo.name}</h3>
            <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 text-xs">
              <Users className="h-3 w-3" />{stats.uniqueCandidateCount}
            </span>
            <div className="flex-1" />
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
            )}
          </div>

          {/* Row 2: status summary group */}
          <div className="flex flex-wrap">
            <div className="inline-flex items-center gap-3 bg-slate-100 rounded-lg px-3 py-1.5 text-sm">
              <span className="inline-flex items-center gap-1 text-slate-600">
                <UserPen className="h-4 w-4" />{stats.rolesWithRecsCount}
              </span>
              <span className="inline-flex items-center gap-1 text-steel-600">
                <Check className="h-4 w-4" />{stats.assignedCount}
              </span>
              <span className="inline-flex items-center gap-1 text-forest-600">
                <CircleCheckBig className="h-4 w-4" />{stats.filledCount}
              </span>
              <span className="text-slate-400">/{stats.total}</span>
            </div>
          </div>
        </button>

        {/* FLOATING DROPDOWN */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-[400px] overflow-y-auto">
            <div className="p-2">
              {siloRoles.map(role => {
                const decision    = getRoleDecision(role.id);
                const isFilled   = decision?.status === 'filled';
                const isAssigned = !isFilled && !!decision?.selected_candidate_id;
                const candidate  = decision?.selected_candidate_id
                  ? candidates.find(c => c.id === decision.selected_candidate_id)
                  : undefined;
                const isSelected = selectedRoleId === role.id;

                return (
                  <button
                    key={role.id}
                    onClick={() => handleRoleClick(role.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all mb-2 ${
                      isSelected
                        ? 'bg-sound-100 border-2 border-sound-500'
                        : 'bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">

                      {/* Selection Order Badge */}
                      {role.selection_order != null && (
                        <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg border-2 border-slate-300 flex items-center justify-center">
                          <span className="text-sm font-bold text-slate-700">{role.selection_order}</span>
                        </div>
                      )}

                      {/* Role Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <p className="font-semibold text-slate-900 text-sm"><FormattedRoleTitle title={role.title} /></p>
                          {roleMatchTotals !== undefined && (
                            <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 text-xs shrink-0">
                              <Users className="h-3 w-3" />{roleMatchTotals[role.id] ?? 0}
                            </span>
                          )}
                        </div>
                        {(isFilled || isAssigned) && candidate && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            {isFilled
                              ? <CheckCircle className="h-3.5 w-3.5 text-forest-400 shrink-0" />
                              : <Check className="h-3.5 w-3.5 text-steel-500 shrink-0" />
                            }
                            <span>{candidate.full_name}</span>
                          </div>
                        )}
                      </div>

                      {/* Status Pill */}
                      <div className="flex-shrink-0 self-center">
                        {isFilled ? (
                          <span className="px-2 py-0.5 bg-forest-100 text-forest-700 text-xs font-medium rounded whitespace-nowrap">Filled</span>
                        ) : isAssigned ? (
                          <span className="px-2 py-0.5 bg-steel-100 text-steel-700 text-xs font-medium rounded whitespace-nowrap">Assigned</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded whitespace-nowrap">Open</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              
              {/* Add Role Button */}
              <button
                onClick={() => handleAddRoleClick(silo.id)}
                className="w-full text-left p-3 rounded-lg bg-sound-50 border-2 border-dashed border-sound-300 hover:bg-sound-100 hover:border-sound-400 transition-all mt-2"
              >
                <p className="font-medium text-sound-600 text-sm text-center">+ Add New Role</p>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">Silos Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSilos.map(silo => renderSilo(silo))}
      </div>

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div>
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h3 className="text-xl font-bold text-slate-900">Add New Role</h3>
                <button
                  onClick={() => setShowAddRoleModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Role Title *
                  </label>
                  <input
                    type="text"
                    value={newRoleTitle}
                    onChange={(e) => setNewRoleTitle(e.target.value)}
                    placeholder="e.g., Transportation Overseer"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    rows={3}
                    placeholder="Role responsibilities and requirements"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Qualities Needed
                  </label>
                  <textarea
                    value={newRoleQualities}
                    onChange={(e) => setNewRoleQualities(e.target.value)}
                    rows={3}
                    placeholder="Desired candidate qualities"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Selection Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newRoleSelectionOrder}
                    onChange={(e) => setNewRoleSelectionOrder(e.target.value)}
                    placeholder="e.g., 1, 2, 3..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewRole}
                  disabled={!newRoleTitle.trim()}
                  className="px-4 py-2 bg-sound-500 text-white text-sm font-medium rounded-lg hover:bg-sound-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Create Role
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
