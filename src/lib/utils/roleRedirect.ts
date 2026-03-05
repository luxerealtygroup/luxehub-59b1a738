import { supabase } from '@/integrations/supabase/client';

export async function getRoleBasedRedirect(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const roles = (data || []).map(r => r.role);

  if (roles.includes('owner') || roles.includes('admin')) {
    return '/dashboard/admin';
  }
  if (roles.includes('planning_access')) {
    return '/dashboard/business-planning';
  }
  // agent or any other role
  return '/dashboard';
}
