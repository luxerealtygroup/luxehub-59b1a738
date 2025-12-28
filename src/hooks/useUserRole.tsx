import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'owner' | 'admin' | 'agent';

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export const useUserRole = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setIsLoading(false);
      return;
    }

    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching roles:', error);
        setRoles([]);
      } else {
        setRoles((data || []).map(r => r.role as AppRole));
      }
      setIsLoading(false);
    };

    fetchRoles();
  }, [user]);

  const isOwner = roles.includes('owner');
  const isAdmin = roles.includes('admin') || isOwner;
  const isAgent = roles.includes('agent') || isAdmin || isOwner;

  const hasRole = useCallback((role: AppRole) => {
    if (role === 'agent') return isAgent;
    if (role === 'admin') return isAdmin;
    if (role === 'owner') return isOwner;
    return false;
  }, [isOwner, isAdmin, isAgent]);

  return {
    roles,
    isLoading,
    isOwner,
    isAdmin,
    isAgent,
    hasRole,
  };
};
