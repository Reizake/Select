// src/components/board/SelectedRoleCard.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Search, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Role, RoleDecision, Candidate, Silo } from '@/types';
import { FormattedRoleTitle } from '@/components/board/FormattedRoleTitle';

interface SelectedRoleCardProps {
  role: Role;
  decision?: RoleDecision;
  candidates: Candidate[];
  silos: Silo[];
  onClose: () => void;
  onAssignCandidate: (candidateId: string | null) => void;
  onMarkFilled: () => void;
  onUnfill: () => void;
  onAddCandidateToRole: (candidateId: string) => void;
  onUpdateRole: (roleId: string, title: string, description: string, qualities: string, proximityScore: number | null, selectionOrder: number | null, siloId: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  prevRoleTitle?: string;
  nextRoleTitle?: string;
  onAdminModalOpenChange?: (open: boolean) => void;
}

export function SelectedRoleCard({
  role,
  decision,
  candidates,
  silos,
  onClose,
  onAssignCandidate,
  onMarkFilled,
  onUnfill,
  onAddCandidateToRole,
  onUpdateRole,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  prevRoleTitle,
  nextRoleTitle,
  onAdminModalOpenChange,
}: SelectedRoleCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCandidateList, setShowCandidateList] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editTitle, setEditTitle] = useState(role.title);
  const [editDescription, setEditDescription] = useState(role.description || '');
  const [editQualities, setEditQualities] = useState(role.qualities || '');
  const [editProximityScore, setEditProximityScore] = useState(role.proximity_score?.toString() || '');
  const [editSelectionOrder, setEditSelectionOrder] = useState(role.selection_order?.toString() || '');
  const [editSiloId, setEditSiloId] = useState(role.silo_id);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Notify parent when admin modal opens/closes
  const openAdminModal = () => {
    setShowAdminModal(true);
    onAdminModalOpenChange?.(true);
  };
  const closeAdminModal = () => {
    setShowAdminModal(false);
    onAdminModalOpenChange?.(false);
  };

  // Update edit fields whenever the role changes
  useEffect(() => {
    setEditTitle(role.title);
    setEditDescription(role.description || '');
    setEditQualities(role.qualities || '');
    setEditProximityScore(role.proximity_score?.toString() || '');
    setEditSelectionOrder(role.selection_order?.toString() || '');
    setEditSiloId(role.silo_id);
  }, [role.id, role.title, role.description, role.qualities, role.proximity_score, role.selection_order, role.silo_id]);

  const isFilled = decision?.status === 'filled';
  const assignedCandidate = decision?.selected_candidate_id ? candidates.find(c => c.id === decision.selected_candidate_id) : null;

  // Get candidates matched to this role
  const matchedCandidates = useMemo(() =>
    candidates
      .filter(c => c.roles?.some(rm => rm.role_id === role.id))
      .sort((a, b) => {
        const aSort = a.roles?.find(rm => rm.role_id === role.id)?.sort_order ?? Number.MAX_SAFE_INTEGER;
        const bSort = b.roles?.find(rm => rm.role_id === role.id)?.sort_order ?? Number.MAX_SAFE_INTEGER;
        return aSort - bSort;
      }),
    [candidates, role.id]
  );

  // Get all other candidates (not matched)
  const unmatchedCandidates = useMemo(() =>
    candidates.filter(c => !c.roles?.some(rm => rm.role_id === role.id)),
    [candidates, role.id]
  );

  // Filter unmatched candidates by search query
  const filteredUnmatchedCandidates = useMemo(() => {
    if (!searchQuery.trim()) return unmatchedCandidates;
    const query = searchQuery.toLowerCase();
    return unmatchedCandidates.filter(c => c.full_name.toLowerCase().includes(query));
  }, [unmatchedCandidates, searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCandidateList(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Arrow-key navigation between roles
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, hasPrev, hasNext]);

  const handleAddCandidate = (candidateId: string) => {
    onAddCandidateToRole(candidateId);
    setSearchQuery('');
    setShowCandidateList(false);
  };

  const handleSaveRole = () => {
    const proximityScore = editProximityScore ? parseInt(editProximityScore) : null;
    const selectionOrder = editSelectionOrder ? parseInt(editSelectionOrder) : null;
    onUpdateRole(role.id, editTitle, editDescription, editQualities, proximityScore, selectionOrder, editSiloId);
    closeAdminModal();
  };

  return (
    <>
      <div className="relative bg-white rounded-xl shadow-md border border-slate-200 p-6 @container">
        {/* Header: three ordered flex children — leading badges, action cluster, title+FILLED */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          {/* Leading group: number + silo badges — always on row 1, never wraps */}
          <div className="flex items-center gap-2 shrink-0 order-1">
            {role.selection_order != null && (
              <div className="w-10 h-10 bg-white rounded-lg border-2 border-slate-300 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-slate-700 text-sm">{role.selection_order}</span>
              </div>
            )}
            {role.silo && (
              <span className="px-2 py-1 bg-sound-100 text-sound-600 text-xs font-medium rounded flex-shrink-0">{role.silo.name}</span>
            )}
          </div>

          {/* Action cluster — row 1 right (ml-auto on narrow), order-3 at container md+ */}
          <div className="flex items-center gap-1 shrink-0 order-2 @md:order-3 ml-auto @md:ml-0">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              title={prevRoleTitle ? `Previous: ${prevRoleTitle} (←)` : 'Previous role (←)'}
              aria-label="Previous role"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              title={nextRoleTitle ? `Next: ${nextRoleTitle} (→)` : 'Next role (→)'}
              aria-label="Next role"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={openAdminModal}
              aria-label="Edit role"
              title="Edit role"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close role detail"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Title + FILLED group — row 2 on narrow (w-full), fits on row 1 at container md+ (flex-1) */}
          <div className="flex items-baseline gap-2 flex-wrap order-3 @md:order-2 w-full @md:w-auto @md:flex-1 @md:min-w-0">
            <h3 className="text-lg font-bold text-slate-900">
              <FormattedRoleTitle title={role.title} />
            </h3>
            {isFilled && (
              <span className="px-2 py-1 bg-forest-100 text-forest-600 text-xs font-medium rounded flex-shrink-0">FILLED</span>
            )}
          </div>
        </div>

        {role.description && <div className="mb-4"><h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">Description</h4><p className="text-sm text-slate-600">{role.description}</p></div>}
        {role.qualities && <div className="mb-4"><h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">Qualities Needed</h4><p className="text-sm text-slate-600">{role.qualities}</p></div>}
        {role.proximity_score && <div className="mb-4"><h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">Proximity Score</h4><p className="text-sm font-bold text-sound-500">{role.proximity_score}</p></div>}

        {/* Assignment Section */}
        <div className="border-t border-slate-200 pt-4 space-y-3">
          {/* Currently Assigned To - Compact Layout */}
          {isFilled && assignedCandidate && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Currently Assigned To
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={decision?.selected_candidate_id || ''}
                  onChange={(e) => onAssignCandidate(e.target.value || null)}
                  className="flex-1 min-w-[200px] max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  disabled={isFilled}
                >
                  <option value="">Select a candidate...</option>
                  {matchedCandidates.length > 0 && (
                    <optgroup label="Matched to this role">
                      {matchedCandidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </optgroup>
                  )}
                  {unmatchedCandidates.length > 0 && (
                    <optgroup label="All other candidates">
                      {unmatchedCandidates.slice(0, 100).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </optgroup>
                  )}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={onUnfill}
                    title="Reopen Role"
                    className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    Reopen<span className="hidden lg:inline"> Role</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to clear this assignment and reopen the role?')) {
                        onAssignCandidate(null);
                      }
                    }}
                    title="Clear Assignment"
                    className="px-4 py-2 bg-slate-500 text-white text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Clear<span className="hidden lg:inline"> Assignment</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 italic mt-2">
                &ldquo;Reopen Role&rdquo; keeps the candidate assigned but marks the role unconfirmed. &ldquo;Clear Assignment&rdquo; removes the candidate and reopens the role.
              </p>
            </div>
          )}

          {/* Assign Candidate Section - Only When Not Filled */}
          {!isFilled && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Assign Candidate
              </label>
              <div className="flex gap-2 items-center">
              <select
                value={decision?.selected_candidate_id || ''}
                onChange={(e) => onAssignCandidate(e.target.value || null)}
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
              >
                <option value="">Select a candidate...</option>
                {matchedCandidates.length > 0 && (
                  <optgroup label="Matched to this role">
                    {matchedCandidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </optgroup>
                )}
                {unmatchedCandidates.length > 0 && (
                  <optgroup label="All other candidates">
                    {unmatchedCandidates.slice(0, 100).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </optgroup>
                )}
              </select>
              {decision?.selected_candidate_id && (
                <button
                  type="button"
                  onClick={() => onAssignCandidate(null)}
                  className="shrink-0 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Clear
                </button>
              )}
              </div>
            </div>
          )}

          {/* Add Candidate to Role Section */}
          {!isFilled && (
            <div className="border-t border-slate-200 pt-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Add Candidate to Recommendations
              </label>
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Type to search candidates..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.length > 0) setShowCandidateList(true);
                      else setShowCandidateList(false);
                    }}
                    onFocus={() => { if (searchQuery.length > 0) setShowCandidateList(true); }}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>
                {showCandidateList && searchQuery.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredUnmatchedCandidates.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">No candidates found</div>
                    ) : (
                      <>
                        {filteredUnmatchedCandidates.slice(0, 50).map(candidate => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => handleAddCandidate(candidate.id)}
                            className="w-full text-left px-3 py-2 hover:bg-sound-50 flex items-center justify-between group transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{candidate.full_name}</p>
                              {candidate.congregation && (
                                <p className="text-xs text-slate-500 truncate">{candidate.congregation}</p>
                              )}
                            </div>
                            <UserPlus className="h-4 w-4 text-slate-400 group-hover:text-sound-500 ml-2 flex-shrink-0" />
                          </button>
                        ))}
                        {filteredUnmatchedCandidates.length > 50 && (
                          <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-200">
                            Showing first 50 of {filteredUnmatchedCandidates.length} results. Keep typing to narrow search.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Type name to search • {unmatchedCandidates.length} candidates available
              </p>
            </div>
          )}

          {/* Mark as Filled Button */}
          {!isFilled && assignedCandidate && (
            <div>
              <button onClick={onMarkFilled} className="w-full bg-forest-400 text-white font-medium px-4 py-2 rounded-lg hover:bg-forest-500 transition-colors">
                Mark as Filled
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ADMIN Modal — portalled to document.body so fixed positioning escapes sticky/transform ancestors */}
      {showAdminModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Fixed header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-xl font-bold text-slate-900">Edit Role</h3>
              <button onClick={closeAdminModal} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto p-6 flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Silo</label>
                  <select
                    value={editSiloId}
                    onChange={(e) => setEditSiloId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  >
                    {silos.map(silo => (
                      <option key={silo.id} value={silo.id}>{silo.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Role Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Role Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500 resize-y"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Qualities Needed</label>
                  <textarea
                    value={editQualities}
                    onChange={(e) => setEditQualities(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500 resize-y"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Proximity Score (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editProximityScore}
                    onChange={(e) => setEditProximityScore(e.target.value)}
                    placeholder="Leave blank or enter 1-10"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Selection Order</label>
                  <input
                    type="number"
                    min="1"
                    value={editSelectionOrder}
                    onChange={(e) => setEditSelectionOrder(e.target.value)}
                    placeholder="Enter selection order number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                </div>
              </div>
            </div>

            {/* Fixed footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200 flex-shrink-0">
              <button
                onClick={closeAdminModal}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                className="px-4 py-2 bg-sound-500 text-white text-sm font-medium rounded-lg hover:bg-sound-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
