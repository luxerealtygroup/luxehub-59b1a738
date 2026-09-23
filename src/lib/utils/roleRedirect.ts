import { supabase } from '@/integrations/supabase/client';

export async function getRoleBasedRedirect(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const roles = (data || []).map(r => r.role);

  if (roles.includes('owner') || roles.includes('admin') || roles.includes('operations')) {
    return '/dashboard/admin';
  }
  if (roles.includes('planning_access')) {
    return '/dashboard/business-planning';
  }
  // No team role at all: this may be a portal client, who belongs in the
  // client portal rather than the realtor dashboard.
  if (roles.length === 0) {
    const { data: clientAccount } = await supabase
      .from('client_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (clientAccount) return '/client-portal';
  }

  // agent or any other role
  return '/dashboard';
}
