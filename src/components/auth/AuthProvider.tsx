// src/components/auth/AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Check active sessions and push token to Realtime immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token && session.access_token !== lastTokenRef.current) {
        lastTokenRef.current = session.access_token;
        supabase.realtime.setAuth(session.access_token);
        console.log('[realtime:auth-provider] setAuth called for INITIAL getSession');
      }
    });

    // Listen for auth changes and keep Realtime token in sync
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token && (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) && session.access_token !== lastTokenRef.current) {
        lastTokenRef.current = session.access_token;
        supabase.realtime.setAuth(session.access_token);
        console.log('[realtime:auth-provider] setAuth called for', event);
      } else if (event === 'USER_UPDATED') {
        console.log('[realtime:auth-provider] USER_UPDATED — metadata change, no channel action needed');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
