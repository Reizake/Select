// src/components/board/CandidateCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Bookmark, BookmarkCheck, Check, ChevronsUp, CircleCheckBig, Edit2, Lock, Maximize2, Trash2, UserCheck, UserPlus, X } from 'lucide-react';
import type { Candidate, CandidateRoleMatch, Role, RoleDecision } from '@/types';


interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onExpand: () => void;
  isAssigned?: boolean;
  assignedRoleTitle?: string;
  lockedBy?: string;
  dragLockedBy?: string;
  onToggleBookmark?: (candidateId: string, next: boolean) => void;
  onRemoveFromRole?: () => void;
  isAssignedToFilledRole?: boolean;
  roleDecisions?: RoleDecision[];
  roles?: Role[];
  roleMatchTotals?: Record<string, number>;
  roleRankMap?: Map<string, Map<string, { rank: number; total: number }>>;
  onPromoteToRole?: () => void;
  onAssign?: () => void;
  onMoveToTop?: () => void;
  isCurrentRoleAssignee?: boolean;
}

export function CandidateCard({
  candidate,
  isSelected,
  onClick,
  onEdit,
  onExpand,
  lockedBy,
  dragLockedBy,
  onToggleBookmark,
  onRemoveFromRole,
  isAssignedToFilledRole = false,
  roleDecisions = [],
  roles = [],
  roleMatchTotals,
  roleRankMap,
  onPromoteToRole,
  onAssign,
  onMoveToTop,
  isCurrentRoleAssignee = false,
}: CandidateCardProps) {
  const [showIcons, setShowIcons] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lockTooltipVisible, setLockTooltipVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const trashButtonRef = useRef<HTMLButtonElement>(null);

  const selectedDecisions = roleDecisions.filter(d => d.selected_candidate_id === candidate.id);
  const isFilled = selectedDecisions.some(d => d.status === 'filled');
  const isAssigned = !isFilled && selectedDecisions.some(d => d.status !== 'filled');
  const isPrimary = !isFilled && !isAssigned && (candidate.roles?.some(rm => rm.is_primary_recommendation) ?? false);
  const hasAnyMatch = !isFilled && !isAssigned && !isPrimary && (candidate.roles?.length ?? 0) > 0;
  const displayedSelectedDecisions = selectedDecisions.slice(0, 3);
  const extraSelectedCount = selectedDecisions.length - 3;

  const assignedRoleIds = new Set(selectedDecisions.map(d => d.role_id));
  const recommendations = (candidate.roles ?? [])
    .filter(rm => !assignedRoleIds.has(rm.role_id))
    .map(rm => ({ rm, role: roles.find(r => r.id === rm.role_id) }))
    .filter((x): x is { rm: CandidateRoleMatch; role: Role } => x.role != null)
    .sort((a, b) => (a.role.selection_order ?? 999) - (b.role.selection_order ?? 999));
  const visibleCap = selectedDecisions.length > 0 ? 2 : 3;
  const visibleRecs = recommendations.slice(0, visibleCap);
  const extraRecCount = Math.max(0, recommendations.length - visibleCap);

  // Handle click outside to hide icons
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setShowIcons(false);
      }
    }

    if (showIcons) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showIcons]);

  // Cancel the delete-confirm when interacting outside the trash button.
  useEffect(() => {
    if (!confirmDelete) return;
    function handleCancel(event: MouseEvent | TouchEvent) {
      if (trashButtonRef.current && !trashButtonRef.current.contains(event.target as Node)) {
        setConfirmDelete(false);
      }
    }
    document.addEventListener('mousedown', handleCancel);
    document.addEventListener('touchstart', handleCancel);
    return () => {
      document.removeEventListener('mousedown', handleCancel);
      document.removeEventListener('touchstart', handleCancel);
    };
  }, [confirmDelete]);

  // True when a top-right icon (Lock or X/Trash) is actually rendered — used to
  // offset the bookmark indicator and action cluster so they don't overlap it.
  const hasTopRightIcon = !lockedBy && (isAssignedToFilledRole || (!!onRemoveFromRole && !isCurrentRoleAssignee));

  const handleCardClick = () => {
    if (!showIcons) {
      setShowIcons(true);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      className={`
        relative bg-white rounded-lg border-2 p-4 cursor-pointer transition-all min-h-[280px] max-h-[420px] overflow-hidden h-full
        ${confirmDelete
          ? 'border-red-400 shadow-md'
          : isSelected
          ? 'border-sound-500 shadow-lg'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
        }
      `}
    >
      <div className={(lockedBy || dragLockedBy) ? 'opacity-60' : ''}>
      {/* Left-edge stripe: priority = filled > assigned/primary-rec > any-match */}
      {(isFilled || isAssigned || isPrimary || hasAnyMatch) && (
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
          isFilled                  ? 'bg-forest-500'
          : (isAssigned || isPrimary) ? 'bg-steel-500'
          :                            'bg-blue-200'
        }`} />
      )}

      {/* Top-right button: Lock (filled assignee) | X/Trash (pool card) | nothing (in-progress assignee) */}
      {!lockedBy && (
        isAssignedToFilledRole ? (
          <div className="absolute top-2 right-2">
            <button
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setLockTooltipVisible(true)}
              onMouseLeave={() => setLockTooltipVisible(false)}
              className="p-1 text-slate-400 hover:text-forest-500 transition-colors"
            >
              <Lock className="h-4 w-4" />
            </button>
            {lockTooltipVisible && (
              <div className="absolute right-0 top-7 z-50 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
                Role is filled
              </div>
            )}
          </div>
        ) : onRemoveFromRole && !isCurrentRoleAssignee ? (
          <button
            ref={trashButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDelete) onRemoveFromRole();
              else setConfirmDelete(true);
            }}
            className={`absolute top-2 right-2 p-1 transition-colors ${confirmDelete ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
            title={confirmDelete ? 'Confirm remove from role' : 'Remove from role'}
          >
            {confirmDelete ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </button>
        ) : null
      )}

      {/* Persistent bookmark indicator — visible at rest when bookmarked */}
      {!showIcons && candidate.is_bookmarked && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(candidate.id, false); }}
          disabled={!!lockedBy}
          className={`absolute z-10 p-1 text-salmon-500 ${hasTopRightIcon ? 'top-10 right-2' : 'top-2 right-2'}`}
          title="Bookmarked — click to remove"
        >
          <BookmarkCheck className="h-4 w-4 fill-current" />
        </button>
      )}

      {/* Action Icons - Top Right */}
      {showIcons && !lockedBy && (
        <div className={`absolute top-2 flex gap-2 ${hasTopRightIcon ? 'right-8' : 'right-2'}`}>
          {onAssign && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign(); }}
              className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
              title="Assign to role"
            >
              <UserCheck className="h-4 w-4 text-slate-700" />
            </button>
          )}
          {onMoveToTop && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveToTop(); }}
              className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
              title="Move to top"
            >
              <ChevronsUp className="h-4 w-4 text-slate-700" />
            </button>
          )}
          {onToggleBookmark && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(candidate.id, !candidate.is_bookmarked); }}
              className={`p-2 border rounded-lg shadow-sm transition-all ${
                candidate.is_bookmarked
                  ? 'bg-salmon-500 border-salmon-500 text-white'
                  : 'bg-white border-slate-300 hover:bg-slate-50 hover:border-slate-400'
              }`}
              title={candidate.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              {candidate.is_bookmarked
                ? <BookmarkCheck className="h-4 w-4" />
                : <Bookmark className="h-4 w-4 text-slate-700" />
              }
            </button>
          )}
          {onPromoteToRole && (
            <button
              onClick={(e) => { e.stopPropagation(); onPromoteToRole(); }}
              className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
              title="Add to this role"
            >
              <UserPlus className="h-4 w-4 text-slate-700" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
            title="Edit candidate"
          >
            <Edit2 className="h-4 w-4 text-slate-700" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
            title="Expand view"
          >
            <Maximize2 className="h-4 w-4 text-slate-700" />
          </button>
        </div>
      )}

      {/* Top section: photo + identity info */}
      <div className={`flex gap-3 mb-3 ${!hasTopRightIcon ? 'pr-8' : ''}`}>
        {candidate.photo_url && (
          <img
            src={candidate.photo_url}
            alt={candidate.full_name}
            className="w-24 h-[116px] rounded-lg object-cover shrink-0 border border-slate-200"
          />
        )}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-base mb-1">
            {candidate.full_name}
          </h3>
          {candidate.congregation && (
            <p className="text-sm text-slate-600 mb-1">{candidate.congregation}</p>
          )}
          {candidate.age && (
            <p className="text-sm text-slate-600 mb-1">
              <span className="font-medium">Age:</span> {candidate.age}
            </p>
          )}
          <p className="text-sm text-slate-600">
            <span className="font-medium">Location:</span> {candidate.location || ''}
          </p>
        </div>
      </div>

      {/* Selected role list: roles where this candidate is the chosen pick */}
      {selectedDecisions.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {displayedSelectedDecisions.map(decision => {
            const role = roles.find(r => r.id === decision.role_id);
            if (!role) return null;
            const rankInfo = roleRankMap?.get(decision.role_id)?.get(candidate.id);
            const rank = rankInfo?.rank ?? null;
            const total = rankInfo?.total ?? 0;
            const iconColor = decision.status === 'filled' ? 'text-forest-500' : 'text-steel-500';
            const Icon = decision.status === 'filled' ? CircleCheckBig : Check;
            return (
              <div key={decision.id} className={`flex items-center justify-between gap-1.5 text-sm ${iconColor}`}>
                <div className="flex items-center gap-1 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{role.title}</span>
                </div>
                {decision.status !== 'filled' && total > 0 && (
                  <span className="shrink-0 tabular-nums text-xs whitespace-nowrap">
                    <span className="font-semibold">{rank ?? '—'}</span>
                    <span className="opacity-60"> / </span>
                    <span className="opacity-60 text-[11px]">{total}</span>
                  </span>
                )}
              </div>
            );
          })}
          {extraSelectedCount > 0 && (
            <p className="text-sm text-slate-400">+{extraSelectedCount} more</p>
          )}
        </div>
      )}

      {/* Recommendations: matches where candidate is not the selected pick */}
      {visibleRecs.length > 0 && (
        <div className="mb-2 space-y-0.5 pl-[18px]">
          {visibleRecs.map(({ rm, role }) => {
            const rankInfo = roleRankMap?.get(rm.role_id)?.get(candidate.id);
            const rank = rankInfo?.rank ?? null;
            const total = rankInfo?.total ?? roleMatchTotals?.[rm.role_id] ?? 0;
            return (
              <div key={rm.id} className="flex items-center justify-between gap-1.5 leading-tight py-0.5">
                <span className="truncate text-xs text-slate-700">{role.title}</span>
                <span className="shrink-0 tabular-nums text-xs whitespace-nowrap">
                  <span className="font-semibold text-slate-700">{rank ?? '—'}</span>
                  <span className="text-slate-400"> / </span>
                  <span className="text-slate-400 text-[11px]">{total}</span>
                </span>
              </div>
            );
          })}
          {extraRecCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer py-0.5 transition-colors"
            >
              +{extraRecCount} more
            </button>
          )}
        </div>
      )}

      {/* Current Responsibilities */}
      {candidate.current_responsibilities && (
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-medium">Current:</span> {candidate.current_responsibilities}
        </p>
      )}

      {/* Circuit Responsibilities */}
      {candidate.circuit_responsibilities && (
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-medium">Circuit:</span> {candidate.circuit_responsibilities}
        </p>
      )}

      {/* Regional Experience */}
      {candidate.experience && (
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-medium">Regional Experience:</span> {candidate.experience}
        </p>
      )}

      {/* Comments */}
      {candidate.comments && (
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-medium">Comments:</span> {candidate.comments}
        </p>
      )}

      {/* CO Comments */}
      {candidate.co_comments && (
        <p className="text-sm text-slate-600 mb-3 pb-3 border-b border-slate-200">
          <span className="font-medium">CO Comments:</span>{' '}
          <span className="italic">"{candidate.co_comments}"</span>
        </p>
      )}

      </div>

      {(lockedBy || dragLockedBy) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white shadow-lg border-2 ${
            lockedBy ? 'border-amber-400 text-amber-700' : 'border-sound-400 text-sound-700'
          }`}>
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {lockedBy ? `Editing: ${lockedBy}` : `Moving: ${dragLockedBy}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
