import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'owner' | 'admin' | 'agent' | 'planning_access';

interface UseUserRoleReturn {
  roles: AppRole[];
  isLoading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isPlanningAccess: boolean;
  hasRole: (role: AppRole) => boolean;
  accessExpired: boolean;
  accessExpiresAt: string | null;
}

export const useUserRole = (): UseUserRoleReturn => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accessExpired, setAccessExpired] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);

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

  const isOwner = roles.includes('owner');
  const isAdmin = roles.includes('admin') || isOwner;
  const isAgent = roles.includes('agent') || isAdmin || isOwner;
  const isPlanningAccess = roles.includes('planning_access');

  const hasRole = useCallback((role: AppRole) => {
    if (role === 'agent') return isAgent;
    if (role === 'admin') return isAdmin;
    if (role === 'owner') return isOwner;
    if (role === 'planning_access') return isPlanningAccess;
    return false;
  }, [isOwner, isAdmin, isAgent, isPlanningAccess]);

  return {
    roles,
    isLoading,
    isOwner,
    isAdmin,
    isAgent,
    isPlanningAccess,
    hasRole,
    accessExpired,
    accessExpiresAt,
  };
};
