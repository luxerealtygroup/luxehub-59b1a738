import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'owner' | 'admin' | 'agent' | 'planning_access' | 'operations';

interface UseUserRoleReturn {
  roles: AppRole[];
  isLoading: boolean;
  isOwner: boolean;
  /** True only for a real owner role — never for Operations. */
  isStrictOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isPlanningAccess: boolean;
  /** Director of Operations: company-wide visibility, never a producing agent. */
  isOperations: boolean;
  hasRole: (role: AppRole) => boolean;
  accessExpired: boolean;
  accessExpiresAt: string | null;
}

export const useUserRole = (): UseUserRoleReturn => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [accessExpired, setAccessExpired] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  // Still loading until roles have been fetched for the CURRENT user — prevents a
  // one-render window where a signed-in user looks role-less and gets redirected.
  const isLoading = loadedFor !== (user?.id ?? null);
  const setIsLoading = (v: boolean) => { if (!v) setLoadedFor(user?.id ?? null); };

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setIsLoading(false);
      setAccessExpired(false);
      setAccessExpiresAt(null);
      return;
    }

    const fetchRolesAndExpiry = async () => {
      // Fetch roles and expiration in parallel
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('profiles').select('access_expires_at').eq('id', user.id).maybeSingle(),
      ]);

      if (rolesResult.error) {
        console.error('Error fetching roles:', rolesResult.error);
        setRoles([]);
      } else {
        setRoles((rolesResult.data || []).map(r => r.role as AppRole));
      }

      const expiresAt = profileResult.data?.access_expires_at;
      setAccessExpiresAt(expiresAt || null);
      if (expiresAt && new Date(expiresAt) < new Date()) {
        setAccessExpired(true);
      } else {
        setAccessExpired(false);
      }

      setIsLoading(false);
    };

    fetchRolesAndExpiry();
  }, [user]);

  const isOperations = roles.includes('operations');
  // Operations is derived from Owner: same rights inside its own team. The only
  // carve-outs are owner management, cross-tenant (super admin) surfaces, and
  // everything agent-production related.
  const strictOwner = roles.includes('owner');
  const isOwner = strictOwner || isOperations;
  const isAdmin = roles.includes('admin') || isOwner;
  const isAgent = roles.includes('agent') || roles.includes('admin') || strictOwner;
  const isPlanningAccess = roles.includes('planning_access');

  const hasRole = useCallback((role: AppRole) => {
    if (role === 'agent') return isAgent;
    if (role === 'admin') return isAdmin;
    if (role === 'owner') return isOwner;
    if (role === 'operations') return isOperations;
    if (role === 'planning_access') return isPlanningAccess;
    return false;
  }, [isOwner, isAdmin, isAgent, isOperations, isPlanningAccess]);

  return {
    roles,
    isLoading,
    isOwner,
    isStrictOwner: strictOwner,
    isAdmin,
    isAgent,
    isOperations,
    isPlanningAccess,
    hasRole,
    accessExpired,
    accessExpiresAt,
  };
};
