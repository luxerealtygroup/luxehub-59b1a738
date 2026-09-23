import React, { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
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

/**
 * Our own copy of the refresh token. The Supabase client clears its stored
 * session when a refresh fails — including when the failure is only "the phone
 * was offline for a moment while the app was backgrounded" — which is what
 * made the native app forget the login. This backup lets us put the session
 * back once the network returns, and survives a force-close.
 */
const BACKUP_KEY = 'luxehub.auth.backup';

const saveBackup = (s: Session | null) => {
  try {
    if (s?.refresh_token) {
      localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify({ refresh_token: s.refresh_token, access_token: s.access_token }),
      );
    }
  } catch { /* storage unavailable */ }
};

const readBackup = (): { refresh_token: string; access_token: string } | null => {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearBackup = () => {
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
};

/**
 * A failed auth call is only proof of a dead session when the server says so.
 * Backgrounded webviews, sleeping tabs and brief offline moments must never
 * sign anyone out, so anything that isn't an explicit rejection keeps the
 * session and gets retried.
 */
const isDefinitelyInvalid = (error: unknown) => {
  const e = error as { status?: number; message?: string } | null;
  if (!e) return false;
  const msg = (e.message || '').toLowerCase();
  const authRejected =
    msg.includes('session_not_found') ||
    msg.includes('session from session_id claim in jwt does not exist') ||
    msg.includes('invalid claim') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('already used') ||
    msg.includes('user not found');
  return (e.status === 400 || e.status === 401 || e.status === 403) && authRejected;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set only when the person taps Sign out, so nothing else can clear them. */
  const explicitSignOut = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    let active = true;

    const apply = (next: Session | null) => {
      if (next) saveBackup(next);
      sessionRef.current = next;
      setSession(next);
      setUser(next?.user ?? null);
    };

    /** Refresh the access token, retrying transient failures instead of giving up. */
    const refreshWithRetry = async (attempts = 3): Promise<'ok' | 'invalid' | 'unavailable'> => {
      if (refreshing.current) return 'ok';
      refreshing.current = true;
      try {
        for (let i = 0; i < attempts; i++) {
          // Prefer the client's own stored session so concurrent tabs share
          // its refresh lock; only fall back to our backup token when the
          // client has lost the session entirely.
          const { data: current } = await supabase.auth.getSession();
          const backup = current.session ? null : readBackup();
          const { data, error } = await supabase.auth.refreshSession(
            backup?.refresh_token ? { refresh_token: backup.refresh_token } : undefined,
          );
          if (!error && data.session) {
            if (active) apply(data.session);
            return 'ok';
          }
          if (isDefinitelyInvalid(error)) {
            clearBackup();
            return 'invalid';
          }
          await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
        return 'unavailable';
      } finally {
        refreshing.current = false;
      }
    };

    // Boot: trust the stored session immediately so the app never flashes the
    // login screen while it is still being restored, then verify in the
    // background.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session && readBackup()) {
        // The client lost its session (a failed refresh while backgrounded),
        // but we still hold the refresh token: restore rather than sign out.
        const result = await refreshWithRetry();
        if (!active) return;
        if (result !== 'ok') {
          // Offline right now — keep the person where they are and retry when
          // the network comes back, instead of dropping them on the login page.
          setLoading(false);
          return;
        }
        setLoading(false);
        return;
      }

      apply(data.session ?? null);
      setLoading(false);

      if (data.session) {
        const expiresAt = (data.session.expires_at ?? 0) * 1000;
        if (expiresAt && expiresAt - Date.now() < 60_000) {
          const result = await refreshWithRetry();
          if (result === 'invalid' && active && !explicitSignOut.current) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            apply(null);
          }
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        // Only an explicit sign out ends the session. A SIGNED_OUT that arrives
        // because a refresh failed while the app was backgrounded gets one
        // recovery attempt first.
        if (explicitSignOut.current) {
          clearBackup();
          apply(null);
          setLoading(false);
          return;
        }
        void (async () => {
          const result = await refreshWithRetry();
          if (result === 'invalid' && active) apply(null);
        })();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && !next) {
        // Keep what we have; the resume/retry path will sort it out.
        return;
      }

      if (next) apply(next);
      setLoading(false);
    });

    // Coming back to the app: the webview may have frozen the refresh timer
    // while it was in the background, so top the token up on resume rather
    // than waiting for an expired request to fail.
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.startAutoRefresh().catch(() => {});
      const current = sessionRef.current;
      if (!current) return;
      const expiresAt = (current.expires_at ?? 0) * 1000;
      if (!expiresAt || expiresAt - Date.now() < 120_000) void refreshWithRetry();
    };
    const onOnline = () => {
      if (sessionRef.current || readBackup()) void refreshWithRetry();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onOnline);

    return () => {
      active = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onOnline);
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
    explicitSignOut.current = true;
    clearBackup();
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      sessionRef.current = null;
    }
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
