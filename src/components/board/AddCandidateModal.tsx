// src/components/board/AddCandidateModal.tsx
'use client';

import { useState } from 'react';
import { X, ImageIcon } from 'lucide-react';
import type { Role } from '@/types';
import { uploadCandidatePhoto } from '@/lib/uploadCandidatePhoto';

interface AddCandidateModalProps {
  roles: Role[];
  onClose: () => void;
  onSave: (candidate: {
    full_name: string;
    age?: number | null;
    congregation?: string | null;
    location?: string | null;
    current_responsibilities?: string | null;
    comments?: string | null;
    experience?: string | null;
    photo_url?: string;
  }, roleIds: string[]) => Promise<void>;
}

export function AddCandidateModal({ roles, onClose, onSave }: AddCandidateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    age: '',
    congregation: '',
    location: '',
    current_responsibilities: '',
    comments: '',
    experience: '',
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const url = await uploadCandidatePhoto(file, undefined);
      setPhotoUrl(url);
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const candidateData = {
        ...formData,
        age: formData.age ? parseInt(formData.age) : null,
        photo_url: photoUrl || undefined,
      };
      await onSave(candidateData, selectedRoleIds);
      onClose();
    } catch (error) {
      console.error('Error saving candidate:', error);
      alert('Failed to save candidate');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const rolesBySilo = roles.reduce((acc, role) => {
    const siloName = role.silo?.name || 'Other';
    if (!acc[siloName]) acc[siloName] = [];
    acc[siloName].push(role);
    return acc;
  }, {} as Record<string, Role[]>);

  const siloOrder = ['HC1', 'HC2', 'HC3', 'CCC', 'PO', 'RO'];
  const sortedSilos = Object.keys(rolesBySilo).sort((a, b) => {
    const aIndex = siloOrder.indexOf(a);
    const bIndex = siloOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-900">Add New Candidate</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase">Basic Information</h3>
              
              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Photo</label>
                {photoUrl ? (
                  <div className="relative">
                    <img src={photoUrl} alt="Candidate" className="w-32 h-32 rounded-lg object-cover border border-slate-200" />
                    <button type="button" onClick={() => setPhotoUrl(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-slate-400 transition-colors">
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={isUploadingPhoto} className="hidden" />
                    {isUploadingPhoto ? (
                      <span className="text-sm text-slate-500">Uploading...</span>
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="h-8 w-8 text-slate-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-500">Upload Photo</span>
                      </div>
                    )}
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input type="text" required value={formData.full_name} onChange={(e) => handleChange('full_name', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500" placeholder="Last, First" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                <input type="number" value={formData.age} onChange={(e) => handleChange('age', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Congregation</label>
                <input type="text" value={formData.congregation} onChange={(e) => handleChange('congregation', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input type="text" value={formData.location} onChange={(e) => handleChange('location', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Responsibilities</label>
                <input type="text" value={formData.current_responsibilities} onChange={(e) => handleChange('current_responsibilities', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500" placeholder="CBOE, HLC, etc." />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Experience</label>
                <textarea value={formData.experience} onChange={(e) => handleChange('experience', e.target.value)} rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500 resize-y" placeholder="Previous experience and qualifications..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
                <textarea value={formData.comments} onChange={(e) => handleChange('comments', e.target.value)} rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-sound-500 resize-y" placeholder="Additional notes..." />
              </div>

            </div>

            {/* Right Column - Role Matching */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 uppercase">Recommended Roles</h3>
                <span className="text-xs text-slate-500">{selectedRoleIds.length} selected</span>
              </div>

              <div className="border border-slate-200 rounded-lg max-h-[600px] overflow-y-auto">
                {sortedSilos.map((siloName) => (
                  <div key={siloName} className="border-b border-slate-100 last:border-0">
                    <div className="bg-slate-50 px-3 py-2 sticky top-0">
                      <h4 className="text-xs font-semibold text-slate-600">{siloName}</h4>
                    </div>
                    <div className="p-2 space-y-1">
                      {rolesBySilo[siloName]
                        .sort((a, b) => (a.selection_order || 999) - (b.selection_order || 999))
                        .map((role) => (
                          <label key={role.id} className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                            <input type="checkbox" checked={selectedRoleIds.includes(role.id)} onChange={() => toggleRole(role.id)} className="mt-0.5 h-4 w-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-900">{role.title}</p>
                              {role.selection_order && <p className="text-xs text-slate-400">#{role.selection_order}</p>}
                            </div>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-sound-500 text-white text-sm font-medium rounded-lg hover:bg-sound-600 disabled:opacity-50">
              {isSubmitting ? 'Adding...' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
