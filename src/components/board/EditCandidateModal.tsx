// src/components/board/EditCandidateModal.tsx
'use client';

import { useState, useMemo } from 'react';
import { X, User, Trash2, Save } from 'lucide-react';
import type { Candidate, Role, RoleDecision, Silo } from '@/types';
import { uploadCandidatePhoto } from '@/lib/uploadCandidatePhoto';

interface EditCandidateModalProps {
  candidate: Candidate;
  roles: Role[];
  silos: Silo[];
  roleDecisions: RoleDecision[];
  onClose: () => void;
  onSave: (candidateData: any, roleIds: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditCandidateModal({ candidate, roles, silos, roleDecisions, onClose, onSave, onDelete }: EditCandidateModalProps) {
  const [formData, setFormData] = useState({
    full_name: candidate.full_name || '',
    age: candidate.age?.toString() || '',
    congregation: candidate.congregation || '',
    location: candidate.location || '',
    current_responsibilities: candidate.current_responsibilities || '',
    circuit_responsibilities: candidate.circuit_responsibilities || '',
    experience: candidate.experience || '',
    comments: candidate.comments || '',
    co_comments: candidate.co_comments || '',
    personal_email: candidate.personal_email || '',
    jwpub_email: candidate.jwpub_email || '',
    bethel_email: candidate.bethel_email || '',
    cell_phone: candidate.cell_phone || '',
    photo_url: candidate.photo_url || null,
    is_bookmarked: !!candidate.is_bookmarked,
  });

  const [selectedSilos, setSelectedSilos] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(candidate.roles?.map(r => r.role_id) || [])
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>(candidate.photo_url || '');
  const [trashPending, setTrashPending] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const url = await uploadCandidatePhoto(file, candidate.id);
      setPhotoPreview(url);
      setFormData(prev => ({ ...prev, photo_url: url }));
      setTrashPending(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const mainSilos = useMemo(() => {
    const siloOrder = ['HC1', 'HC2', 'HC3', 'CCC', 'PO', 'RO'];
    return silos
      .filter(s => siloOrder.includes(s.name))
      .sort((a, b) => siloOrder.indexOf(a.name) - siloOrder.indexOf(b.name));
  }, [silos]);

  // Roles where this candidate is the active selected pick (in_progress or filled).
  // Unchecking these would orphan the role_decisions row — block removal here and
  // require the user to clear the assignment from the role page instead.
  const lockedRoleIds = useMemo(() => new Set(
    roleDecisions
      .filter(d => d.selected_candidate_id === candidate.id)
      .map(d => d.role_id)
  ), [roleDecisions, candidate.id]);

  const lockedRoleStatus = useMemo(() => {
    const map = new Map<string, string>();
    roleDecisions
      .filter(d => d.selected_candidate_id === candidate.id)
      .forEach(d => map.set(d.role_id, d.status));
    return map;
  }, [roleDecisions, candidate.id]);

  const handleSiloToggle = (siloId: string) => {
    const newSelected = new Set(selectedSilos);
    if (newSelected.has(siloId)) newSelected.delete(siloId);
    else newSelected.add(siloId);
    setSelectedSilos(newSelected);
  };

  const handleRoleToggle = (roleId: string) => {
    const newSelected = new Set(selectedRoles);
    if (newSelected.has(roleId)) {
      if (lockedRoleIds.has(roleId)) return; // assigned/filled — must clear from role page
      newSelected.delete(roleId);
    } else {
      newSelected.add(roleId);
    }
    setSelectedRoles(newSelected);
  };

  const getRolesForSilo = (siloId: string) => {
    return roles
      .filter(r => r.silo_id === siloId)
      .sort((a, b) => (a.selection_order || 999) - (b.selection_order || 999));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(
        {
          full_name: formData.full_name,
          age: formData.age ? parseInt(formData.age) : null,
          congregation: formData.congregation,
          location: formData.location,
          current_responsibilities: formData.current_responsibilities,
          circuit_responsibilities: formData.circuit_responsibilities,
          experience: formData.experience,
          comments: formData.comments,
          co_comments: formData.co_comments,
          personal_email: formData.personal_email || null,
          jwpub_email: formData.jwpub_email || null,
          bethel_email: formData.bethel_email || null,
          cell_phone: formData.cell_phone || null,
          photo_url: formData.photo_url,
          is_bookmarked: formData.is_bookmarked,
        },
        Array.from(selectedRoles)
      );
      onClose();
    } catch (error) {
      console.error('Error saving candidate:', error);
      alert('Error saving candidate');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Edit Candidate</h2>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form="edit-candidate-form"
              disabled={saving}
              className="p-1.5 text-slate-400 hover:text-sound-500 disabled:opacity-40 transition-colors"
              title="Save"
            >
              <Save className="h-5 w-5" />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form id="edit-candidate-form" onSubmit={handleSubmit} className="p-6">

          {/* Identity block — 3-col grid on desktop, 1-col on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] md:grid-rows-2 gap-4 mb-6">

            {/* Full Name — col 1, row 1 */}
            <div className="md:col-start-1 md:row-start-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name *</label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>

            {/* Age — col 2, row 1 */}
            <div className="md:col-start-2 md:row-start-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Age</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>

            {/* Congregation — col 1, row 2 */}
            <div className="md:col-start-1 md:row-start-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Congregation</label>
              <input
                type="text"
                value={formData.congregation}
                onChange={(e) => setFormData({ ...formData, congregation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>

            {/* Location — col 2, row 2 */}
            <div className="md:col-start-2 md:row-start-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>

            {/* Photo — col 3, rows 1-2 on desktop; after Location on mobile */}
            <div className="md:col-start-3 md:row-start-1 md:row-span-2 flex items-center gap-3 md:flex-col md:items-center md:justify-start md:gap-1.5 md:pl-3 md:pt-7">
              <div className="relative shrink-0 group">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Profile preview"
                    className="w-20 h-24 md:w-24 md:h-[116px] rounded-lg object-cover border-2 border-slate-300"
                  />
                ) : (
                  <div className="w-20 h-24 md:w-24 md:h-[116px] rounded-lg bg-slate-100 border-2 border-slate-300 flex items-center justify-center">
                    <User className="h-10 w-10 text-slate-400" />
                  </div>
                )}

                {/* Trash icon — only when photo exists */}
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      if (trashPending) {
                        setPhotoPreview('');
                        setFormData({ ...formData, photo_url: null });
                        setTrashPending(false);
                      } else {
                        setTrashPending(true);
                      }
                    }}
                    className={`absolute bottom-0 left-0 bg-white rounded-full p-1.5 shadow-lg transition-all opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${
                      trashPending ? 'text-red-500' : 'text-slate-500'
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Upload button */}
                <label
                  htmlFor="photo-upload"
                  className={`absolute bottom-0 right-0 bg-sound-500 text-white rounded-full p-1.5 shadow-lg opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity ${isUploadingPhoto ? 'cursor-wait opacity-50' : 'cursor-pointer hover:bg-sound-600'}`}
                >
                  <span className="text-lg font-bold leading-none">{isUploadingPhoto ? '…' : '+'}</span>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={isUploadingPhoto}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Helper text / cancel confirmation */}
              {trashPending ? (
                <button
                  type="button"
                  onClick={() => setTrashPending(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 leading-tight md:text-center transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <p className="text-xs text-slate-400 leading-tight md:text-center">
                  Click + to upload<br className="hidden md:block" /> JPG, PNG, GIF
                </p>
              )}
            </div>
          </div>

          {/* Contact fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Cell Phone</label>
              <input
                type="tel"
                value={formData.cell_phone}
                onChange={(e) => setFormData({ ...formData, cell_phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Personal Email</label>
              <input
                type="email"
                value={formData.personal_email}
                onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">JWPUB Email</label>
              <input
                type="email"
                value={formData.jwpub_email}
                onChange={(e) => setFormData({ ...formData, jwpub_email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Bethel Email</label>
              <input
                type="email"
                value={formData.bethel_email}
                onChange={(e) => setFormData({ ...formData, bethel_email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-base sm:text-sm"
              />
            </div>
          </div>

          {/* Textareas */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Current Responsibilities</label>
              <textarea
                value={formData.current_responsibilities}
                onChange={(e) => setFormData({ ...formData, current_responsibilities: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Circuit Responsibilities</label>
              <textarea
                value={formData.circuit_responsibilities}
                onChange={(e) => setFormData({ ...formData, circuit_responsibilities: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Regional Experience</label>
              <textarea
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Comments</label>
              <textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">CO Comments</label>
              <textarea
                value={formData.co_comments}
                onChange={(e) => setFormData({ ...formData, co_comments: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 text-slate-900 text-sm resize-y"
              />
            </div>
          </div>

          {/* Bookmark */}
          <div className="mb-6">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_bookmarked}
                  onChange={(e) => setFormData({ ...formData, is_bookmarked: e.target.checked })}
                  className="mt-0.5 h-4 w-4 text-salmon-500 border-slate-300 rounded focus:ring-salmon-500"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Bookmark</p>
                  <p className="text-xs text-slate-500 mt-0.5">Flag this brother for further review or discussion. Bookmarked candidates can be filtered in any view.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Match to Roles */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Match to Roles</label>
            <p className="text-xs text-slate-500 mb-3">Select silos first, then choose specific roles from each silo</p>

            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Select Silos:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {mainSilos.map(silo => (
                  <button
                    key={silo.id}
                    type="button"
                    onClick={() => handleSiloToggle(silo.id)}
                    className={`px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                      selectedSilos.has(silo.id)
                        ? 'bg-sound-100 border-sound-400 text-sound-600 font-medium'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {silo.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedSilos.size > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase">Select Roles:</p>
                {Array.from(selectedSilos).map(siloId => {
                  const silo = silos.find(s => s.id === siloId);
                  const siloRoles = getRolesForSilo(siloId);
                  return (
                    <div key={siloId} className="border border-slate-200 rounded-lg p-3">
                      <h4 className="font-semibold text-slate-900 text-sm mb-2">{silo?.name} Roles:</h4>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {siloRoles.map(role => {
                          const isLocked = lockedRoleIds.has(role.id);
                          const lockedStatus = lockedRoleStatus.get(role.id);
                          const hintText = lockedStatus === 'filled'
                            ? 'Currently filled — reopen from role page first'
                            : 'Currently assigned — clear from role page first';
                          return (
                            <label
                              key={role.id}
                              className={`flex items-start gap-3 p-2 rounded ${isLocked ? 'cursor-default opacity-60' : 'hover:bg-slate-50 cursor-pointer'}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedRoles.has(role.id)}
                                onChange={() => handleRoleToggle(role.id)}
                                disabled={isLocked}
                                className="mt-0.5 h-4 w-4 text-sound-500 focus:ring-sound-500 border-slate-300 rounded disabled:cursor-not-allowed"
                              />
                              <div className="flex-1">
                                <p className="font-medium text-slate-900 text-sm">{role.title}</p>
                                {isLocked ? (
                                  <p className="text-xs text-slate-400 italic">{hintText}</p>
                                ) : role.silo ? (
                                  <p className="text-xs text-slate-500">{role.silo.name}</p>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedRoles.size > 0 && (
              <div className="mt-3 p-3 bg-sound-50 rounded-lg">
                <p className="text-sm font-medium text-sound-800">
                  {selectedRoles.size} role{selectedRoles.size !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            {showDeleteConfirm ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-red-600 font-medium">Delete this candidate? This cannot be undone.</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 border border-red-400 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-sound-500 text-white text-sm font-medium rounded-lg hover:bg-sound-600 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
