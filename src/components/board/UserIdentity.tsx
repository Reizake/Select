// src/components/board/UserIdentity.tsx
'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

interface UserIdentityProps {
  onIdentitySet: (identity: { userId: string; name: string }) => void;
}

export function UserIdentity({ onIdentitySet }: UserIdentityProps) {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id && user?.email) {
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      let resolved: string | undefined;
      for (const key of ['display_name', 'full_name', 'name']) {
        const v = meta?.[key];
        if (typeof v === 'string' && v.trim()) { resolved = v.trim(); break; }
      }
      onIdentitySet({ userId: user.id, name: resolved || user.email });
    }
  }, [user, onIdentitySet]);

  return null;
}
