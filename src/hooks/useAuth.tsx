import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // A failed auth read is only proof of a dead session when the server says
    // so. Network blips (coming back from a document view, a sleeping tab)
    // must never sign anyone out, so we retry first and keep the session on
    // anything that isn't an explicit rejection.
    const isDefinitelyInvalid = (error: unknown) => {
      const e = error as { status?: number; message?: string } | null;
      if (!e) return false;
      const msg = (e.message || '').toLowerCase();
      const authRejected =
        msg.includes('session_not_found') ||
        msg.includes('session from session_id claim in jwt does not exist') ||
        msg.includes('invalid claim') ||
        msg.includes('invalid refresh token') ||
        msg.includes('jwt expired') ||
        msg.includes('user not found');
      return (e.status === 401 || e.status === 403) && authRejected;
    };

    const verifySession = async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.auth.getUser();
        if (!error) return { ok: true as const };
        lastError = error;
        if (isDefinitelyInvalid(error)) return { ok: false as const };
        // Transient: back off and try again before doubting the session.
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      // Ran out of retries without a definite rejection — keep the session.
      console.warn('Auth check kept session after transient failures', lastError);
      return { ok: true as const };
    };

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { ok } = await verifySession();
        if (!ok) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          if (!active) return;
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
      }

      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    })();


    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/confirm`
      }
    });

    // Supabase returns a fake user with empty identities if email already exists
    if (!error && data.user && data.user.identities?.length === 0) {
      return { error: new Error('An account with this email already exists. Please sign in instead.') };
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
