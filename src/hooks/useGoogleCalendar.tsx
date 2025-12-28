import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

interface GoogleCalendarState {
  isConnected: boolean;
  isLoading: boolean;
  events: CalendarEvent[];
  error: string | null;
}

const STORAGE_KEY = 'google_calendar_tokens';

export const useGoogleCalendar = () => {
  const { user } = useAuth();
  const [state, setState] = useState<GoogleCalendarState>({
    isConnected: false,
    isLoading: false,
    events: [],
    error: null,
  });

  const getStoredTokens = useCallback(() => {
    if (!user) return null;
    const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    return stored ? JSON.parse(stored) : null;
  }, [user]);

  const storeTokens = useCallback((tokens: { access_token: string; refresh_token?: string; expires_in?: number }) => {
    if (!user) return;
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify({
      ...tokens,
      expires_at: expiresAt,
    }));
  }, [user]);

  const clearTokens = useCallback(() => {
    if (!user) return;
    localStorage.removeItem(`${STORAGE_KEY}_${user.id}`);
    setState(prev => ({ ...prev, isConnected: false, events: [] }));
  }, [user]);

  const refreshAccessToken = useCallback(async (refreshToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'refresh_token',
          refreshToken,
        },
      });

      if (error || data?.error) {
        console.error('Token refresh error:', error || data?.error);
        clearTokens();
        return null;
      }

      storeTokens(data);
      return data.access_token;
    } catch (err) {
      console.error('Token refresh failed:', err);
      clearTokens();
      return null;
    }
  }, [storeTokens, clearTokens]);

  const getValidAccessToken = useCallback(async () => {
    const tokens = getStoredTokens();
    if (!tokens) return null;

    // Check if token is expired (with 5 min buffer)
    if (tokens.expires_at && Date.now() > tokens.expires_at - 300000) {
      if (tokens.refresh_token) {
        return await refreshAccessToken(tokens.refresh_token);
      }
      clearTokens();
      return null;
    }

    return tokens.access_token;
  }, [getStoredTokens, refreshAccessToken, clearTokens]);

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const redirectUri = `${window.location.origin}/dashboard`;
      
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'get_auth_url',
          redirectUri,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || 'Failed to get auth URL');
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('Connect error:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to connect',
      }));
    }
  }, []);

  const handleOAuthCallback = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const redirectUri = `${window.location.origin}/dashboard`;
      
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'exchange_code',
          code,
          redirectUri,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || 'Failed to exchange code');
      }

      storeTokens(data);
      setState(prev => ({ ...prev, isConnected: true, isLoading: false }));
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      
      return true;
    } catch (err) {
      console.error('OAuth callback error:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to complete connection',
      }));
      return false;
    }
  }, [storeTokens]);

  const fetchEvents = useCallback(async () => {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      setState(prev => ({ ...prev, isConnected: false }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'get_events',
          accessToken,
        },
      });

      if (error || data?.error) {
        if (data?.error?.includes('invalid_grant') || data?.error?.includes('Token')) {
          clearTokens();
          throw new Error('Session expired. Please reconnect.');
        }
        throw new Error(data?.error || 'Failed to fetch events');
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        events: data.items || [],
        isConnected: true,
      }));
    } catch (err) {
      console.error('Fetch events error:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch events',
      }));
    }
  }, [getValidAccessToken, clearTokens]);

  const createEvent = useCallback(async (event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
  }) => {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      throw new Error('Not connected to Google Calendar');
    }

    const { data, error } = await supabase.functions.invoke('google-calendar', {
      body: {
        action: 'create_event',
        accessToken,
        event,
      },
    });

    if (error || data?.error) {
      throw new Error(data?.error || 'Failed to create event');
    }

    // Refresh events list
    await fetchEvents();
    
    return data;
  }, [getValidAccessToken, fetchEvents]);

  const disconnect = useCallback(() => {
    clearTokens();
  }, [clearTokens]);

  // Check for OAuth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      handleOAuthCallback(code);
    } else {
      // Check if already connected
      const tokens = getStoredTokens();
      if (tokens?.access_token) {
        setState(prev => ({ ...prev, isConnected: true }));
        fetchEvents();
      }
    }
  }, [user]);

  return {
    ...state,
    connect,
    disconnect,
    fetchEvents,
    createEvent,
  };
};
