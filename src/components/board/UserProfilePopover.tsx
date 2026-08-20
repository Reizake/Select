// src/components/board/UserProfilePopover.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { CircleUserRound, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';

function readDisplayName(user: ReturnType<typeof useAuth>['user']): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  if (!meta) return '';
  for (const key of ['display_name', 'full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function UserProfilePopover() {
  const { user, signOut } = useAuth();
  const supabase = useRef(createClient()).current;
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [savedName, setSavedName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const name = readDisplayName(user);
    setValue(name);
    setSavedName(name);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleBlur = async () => {
    const trimmed = value.trim();
    if (trimmed === savedName) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSavedName(trimmed);
    }
  };

  let helperText: string;
  let helperClass = 'text-slate-500';
  if (saving) {
    helperText = 'Saving…';
  } else if (error) {
    helperText = error;
    helperClass = 'text-red-600';
  } else if (value.trim() === savedName && savedName !== '') {
    helperText = 'Saved';
    helperClass = 'text-forest-600';
  } else {
    helperText = 'Shown to others when you’re editing a candidate.';
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Profile"
        aria-label="Profile"
        className="p-1 text-slate-700 hover:text-slate-900 transition-colors"
      >
        <CircleUserRound className="h-6 w-6" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg border border-slate-200 shadow-xl z-50 p-4">
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Signed in as</p>
            <p className="text-sm text-slate-900 break-all">{user?.email}</p>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
              Display name
            </label>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={handleBlur}
              disabled={saving}
              placeholder="Your name"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500 disabled:opacity-60"
            />
            <p className={`text-xs mt-1 ${helperClass}`}>{helperText}</p>
          </div>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
