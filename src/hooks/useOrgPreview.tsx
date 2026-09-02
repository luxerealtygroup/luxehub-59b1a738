/**
 * Super-admin "View as team" preview.
 *
 * Read-only by construction:
 *  - all previewed data comes from the `org-preview` edge function, which only
 *    ever SELECTs and refuses anyone who is not a super-admin of the original
 *    org (verified server-side against public.is_super_admin);
 *  - no tenant RLS policy is widened, so the signed-in JWT still resolves to
 *    LUXE for every direct Supabase call — a stray write cannot land on the
 *    previewed team's rows;
 *  - `blockOrgPreviewWrite()` stops write handlers in the UI as well.
 *
 * The active preview lives in sessionStorage (survives reloads, dies with the
 * tab) and is mirrored into a tiny module store so TenantProvider — which sits
 * outside the router — can swap branding without prop drilling.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

export interface PreviewBranding {
  orgId: string;
  slug: string | null;
  name: string;
  appName: string | null;
  shortName: string | null;
  brokerageName: string | null;
  primaryColor: string | null;
  textColor: string | null;
  logoUrl: string | null;
  markUrl: string | null;
  seatLimit: number | null;
  tier: string | null;
  fubEnabled: boolean;
}

interface PreviewState {
  sessionId: string;
  branding: PreviewBranding;
}

const STORAGE_KEY = 'orgPreviewSession';

let state: PreviewState | null = readStored();
const listeners = new Set<() => void>();

function readStored(): PreviewState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PreviewState) : null;
  } catch {
    return null;
  }
}

function publish(next: PreviewState | null) {
  state = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable — in-memory state still works for this view.
  }
  listeners.forEach((l) => l());
}

/** True while a team preview is active anywhere in the app. */
export const isOrgPreviewActive = () => state !== null;

/** Call at the top of any write handler reachable while previewing. */
export function blockOrgPreviewWrite(action = 'This action'): boolean {
  if (!isOrgPreviewActive()) return false;
  toast.info('Read-only preview', {
    description: `${action} is disabled while previewing another team's hub.`,
  });
  return true;
}

function useStore(): PreviewState | null {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    const listener = () => setSnapshot(state);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}

/** Branding override consumed by TenantProvider while a preview is active. */
export const useOrgPreviewBranding = (): PreviewBranding | null => useStore()?.branding ?? null;

export function useOrgPreview() {
  const current = useStore();
  const [starting, setStarting] = useState(false);

  const start = async (orgId: string) => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-preview', {
        body: { action: 'start', org_id: orgId },
      });
      if (error || !data?.session?.id || !data?.branding) {
        toast.error('Could not start the preview.');
        return null;
      }
      publish({ sessionId: data.session.id, branding: data.branding as PreviewBranding });
      return data.branding as PreviewBranding;
    } finally {
      setStarting(false);
    }
  };

  /**
   * Reads one allowlisted dataset from the org-preview function.
   *
   * Hard fail by design: a dataset that cannot be read returns `ok: false` so
   * the caller renders an explicit error state. Nothing here ever falls back to
   * a direct Supabase query — that would resolve to the signed-in user's own
   * org and display one team's records inside another team's branding.
   */
  const read = async <T,>(dataset: string): Promise<PreviewRead<T>> => {
    if (!state) return { ok: false, error: 'No active preview session.' };
    const { data, error } = await supabase.functions.invoke('org-preview', {
      body: { action: 'read', org_id: state.branding.orgId, dataset },
    });
    if (error || data == null) {
      return { ok: false, error: error?.message || `Could not load "${dataset}".` };
    }
    return { ok: true, data: data as T };
  };


  const stop = async () => {
    const sessionId = state?.sessionId;
    publish(null);
    if (sessionId) {
      await supabase.functions.invoke('org-preview', {
        body: { action: 'stop', session_id: sessionId },
      });
    }
  };

  return {
    isPreviewing: current !== null,
    branding: current?.branding ?? null,
    sessionId: current?.sessionId ?? null,
    starting,
    start,
    stop,
    read,
  };
}
