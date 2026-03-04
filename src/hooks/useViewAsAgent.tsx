import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

interface AgentOption {
  id: string;
  full_name: string;
  fub_user_id: number | null;
}

interface ViewAsAgentContextType {
  /** True when admin has toggled "View as Agent" */
  isViewingAsAgent: boolean;
  /** The agent being impersonated (null when off) */
  viewingAgentId: string | null;
  /** Display name of the viewed agent */
  viewingAgentName: string | null;
  /** The user ID to use for data queries – returns viewed agent when active, otherwise real user */
  effectiveUserId: string | null;
  /** The FUB user ID mapped to the effective user (for FUB deal filtering) */
  effectiveFubUserId: number | null;
  /** Whether the admin feature is available (admin only) */
  canViewAsAgent: boolean;
  /** Toggle the mode on/off */
  setIsViewingAsAgent: (enabled: boolean) => void;
  /** Select which agent to view as */
  setViewingAgentId: (agentId: string) => void;
  /** List of agents available for selection */
  agentOptions: AgentOption[];
}

const ViewAsAgentContext = createContext<ViewAsAgentContextType | undefined>(undefined);

const STORAGE_KEY = 'viewAsAgent';

export function ViewAsAgentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [isViewingAsAgent, setIsViewingAsAgentState] = useState(false);
  const [viewingAgentId, setViewingAgentIdState] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);

  // Load persisted state from localStorage on mount
  useEffect(() => {
    if (!isAdmin) {
      setIsViewingAsAgentState(false);
      setViewingAgentIdState(null);
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.enabled && parsed.agentId) {
          setIsViewingAsAgentState(true);
          setViewingAgentIdState(parsed.agentId);
        }
      }
    } catch {
      // ignore
    }
  }, [isAdmin]);

  // Fetch agent options for admins (include fub_user_id)
  useEffect(() => {
    if (!isAdmin) return;
    const fetch = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, fub_user_id')
        .not('full_name', 'is', null);

      const [{ data: usersWith411 }, { data: usersWithRoles }] = await Promise.all([
        supabase.from('weekly_411').select('user_id'),
        supabase.from('user_roles').select('user_id'),
      ]);

      const activeIds = new Set((usersWith411 || []).map(w => w.user_id));
      const roleIds = new Set((usersWithRoles || []).map(r => r.user_id));

      const filtered = (profiles || [])
        .filter(p => {
          const hasFub = p.fub_user_id != null && p.fub_user_id !== 8;
          return (hasFub || activeIds.has(p.id) || roleIds.has(p.id)) && p.full_name;
        })
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

      setAgentOptions(filtered as AgentOption[]);
    };
    fetch();
  }, [isAdmin]);

  const persist = (enabled: boolean, agentId: string | null) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, agentId }));
  };

  const setIsViewingAsAgent = useCallback((enabled: boolean) => {
    setIsViewingAsAgentState(enabled);
    if (!enabled) {
      setViewingAgentIdState(null);
      persist(false, null);
    } else {
      // Default to first agent if none selected
      const defaultId = viewingAgentId || agentOptions[0]?.id || null;
      setViewingAgentIdState(defaultId);
      persist(true, defaultId);
    }
  }, [agentOptions, viewingAgentId]);

  const setViewingAgentId = useCallback((agentId: string) => {
    setViewingAgentIdState(agentId);
    persist(true, agentId);
  }, []);

  const activeViewing = isAdmin && isViewingAsAgent;

  const viewingAgent = activeViewing && viewingAgentId
    ? agentOptions.find(a => a.id === viewingAgentId)
    : null;

  const viewingAgentName = viewingAgent?.full_name || null;

  const effectiveUserId = activeViewing && viewingAgentId
    ? viewingAgentId
    : user?.id || null;

  const effectiveFubUserId = activeViewing && viewingAgent
    ? viewingAgent.fub_user_id
    : null; // null means "use current user's own fub_user_id from their profile"

  return (
    <ViewAsAgentContext.Provider value={{
      isViewingAsAgent: activeViewing,
      viewingAgentId: activeViewing ? viewingAgentId : null,
      viewingAgentName,
      effectiveUserId,
      effectiveFubUserId,
      canViewAsAgent: isAdmin,
      setIsViewingAsAgent,
      setViewingAgentId,
      agentOptions,
    }}>
      {children}
    </ViewAsAgentContext.Provider>
  );
}

export function useViewAsAgent() {
  const context = useContext(ViewAsAgentContext);
  if (!context) {
    throw new Error('useViewAsAgent must be used within a ViewAsAgentProvider');
  }
  return context;
}
