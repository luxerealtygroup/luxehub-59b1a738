import { supabase } from '@/integrations/supabase/client';

export async function getRoleBasedRedirect(userId: string): Promise<string> {
  // Temporary-password accounts must choose their own password first.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === userId && user.app_metadata?.must_change_password) return '/client-portal/set-password';

  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('profiles').select('member_type').eq('id', userId).maybeSingle(),
  ]);

  const roles = (data || []).map(r => r.role);

  if (roles.includes('owner') || roles.includes('admin') || roles.includes('operations')) {
    return '/dashboard/admin';
  }
  if (roles.includes('planning_access')) {
    return '/dashboard/business-planning';
  }
  if (roles.includes('agent')) return '/dashboard';

  // No team role can never fall through to the realtor workspace. A claimed
  // client opens their portal; every other least-privileged account requests access.
  if (roles.length === 0) {
    const { data: clientAccount } = await supabase
      .from('client_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (clientAccount) return '/client-portal';
    if (profile?.member_type === 'client') return '/client-portal/request-access';
  }

  return '/login';
}
