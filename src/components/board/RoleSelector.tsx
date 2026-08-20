// src/components/board/RoleSelector.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Role, Candidate, RoleDecision } from '@/types';

interface RoleSelectorProps {
  roles: Role[];
  selectedRoleId: string | null;
  onRoleSelect: (roleId: string | null) => void;
  roleDecisions: RoleDecision[];
  candidates: Candidate[];
  onAssignCandidate: (roleId: string, candidateId: string | null) => void;
  onMarkFilled: (roleId: string) => void;
}

export function RoleSelector({
  roles,
  selectedRoleId,
  onRoleSelect,
  roleDecisions,
  candidates,
  onAssignCandidate,
  onMarkFilled,
}: RoleSelectorProps) {
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  // Sort roles by selection_order
  const sortedRoles = [...roles].sort((a, b) => {
    const orderA = a.selection_order ?? 999;
    const orderB = b.selection_order ?? 999;
    return orderA - orderB;
  });

  // Create a map of role decisions for quick lookup
  const decisionMap = new Map(roleDecisions.map(d => [d.role_id, d]));

  const handleRoleClick = (roleId: string) => {
    // Toggle selection
    if (selectedRoleId === roleId) {
      onRoleSelect(null);
      setExpandedRoleId(null);
    } else {
      onRoleSelect(roleId);
      setExpandedRoleId(roleId);
    }
  };

  const filledCount = roleDecisions.filter(d => d.status === 'filled').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Open Positions</h2>
        <p className="text-sm text-slate-500">
          {filledCount} / {roles.length} filled
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sortedRoles.map((role) => {
          const decision = decisionMap.get(role.id);
          const isFilled = decision?.status === 'filled';
          const assignedCandidateId = decision?.selected_candidate_id;
          const assignedCandidate = assignedCandidateId 
            ? candidates.find(c => c.id === assignedCandidateId)
            : null;
          const isSelected = selectedRoleId === role.id;
          const isExpanded = expandedRoleId === role.id;

          return (
            <button
              key={role.id}
              onClick={() => handleRoleClick(role.id)}
              className={cn(
                'text-left p-4 rounded-lg border transition-all duration-200 hover:shadow-md',
                isSelected
                  ? 'border-sound-400 bg-sound-50 ring-2 ring-sound-200'
                  : 'border-slate-200 bg-white hover:border-slate-300',
                isFilled && 'opacity-60'
              )}
            >
              {/* Header with number */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded">
                  #{role.selection_order ?? 'N/A'}
                </span>
                {isFilled ? (
                  <CheckCircle2 className="h-4 w-4 text-forest-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />
                )}
              </div>

              {/* Role title */}
              <h3 className="font-semibold text-sm text-slate-900 mb-2 line-clamp-2 leading-tight">
                {role.title}
              </h3>

              {/* Silo */}
              {role.silo && (
                <p className="text-xs text-slate-500 mb-2">{role.silo.name}</p>
              )}

              {/* Description preview */}
              {role.description && (
                <p className="text-xs text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                  {role.description}
                </p>
              )}

              {/* Assigned candidate badge */}
              {assignedCandidate && !isFilled && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-medium text-amber-700">
                      {assignedCandidate.full_name}
                    </span>
                  </div>
                </div>
              )}

              {/* Filled badge */}
              {isFilled && assignedCandidate && (
                <div className="mt-2 pt-2 border-t border-forest-200">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-forest-500" />
                    <span className="text-xs font-medium text-forest-600">
                      {assignedCandidate.full_name}
                    </span>
                  </div>
                </div>
              )}

              {/* Expanded controls */}
              {isExpanded && !isFilled && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {/* Candidate dropdown */}
                  <select
                    value={assignedCandidateId || ''}
                    onChange={(e) => {
                      const candidateId = e.target.value || null;
                      onAssignCandidate(role.id, candidateId);
                    }}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  >
                    <option value="">Assign candidate...</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>

                  {/* Mark as filled button */}
                  {assignedCandidateId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkFilled(role.id);
                      }}
                      className="w-full text-xs font-medium px-3 py-1.5 bg-forest-400 text-white rounded-lg hover:bg-forest-500 transition-colors"
                    >
                      Mark as Filled
                    </button>
                  )}
                </div>
              )}

              {/* Qualities/skills preview when selected but not expanded */}
              {isSelected && !isExpanded && role.qualities && (
                <div className="mt-3 pt-3 border-t border-sound-200">
                  <p className="text-xs text-slate-500 italic line-clamp-2">
                    {role.qualities}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
