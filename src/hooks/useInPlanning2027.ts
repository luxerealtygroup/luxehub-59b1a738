import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * Whether the signed-in user takes part in 2027 Business Planning.
 * Admins/owners and planning-preview accounts always do; agents only when they're
 * on the selling-agent list in Planning settings (the demo account stays in for app review).
 */
export function useInPlanning2027(): boolean | null {
  const { user } = useAuth();
  const { isAdmin, isOwner, isStrictOwner, isPlanningAccess, isAgent, loading } = useUserRole() as any;
  const [inList, setInList] = useState<boolean | null>(null);
  const exempt = isAdmin || isOwner || isStrictOwner || (isPlanningAccess && !isAgent);
  useEffect(() => {
    if (!user || loading || exempt) return;
    let off = false;
    (async () => {
      const [{ data: s }, { data: demo }] = await Promise.all([
        supabase.from('planning_settings').select('selling_agent_ids').eq('plan_year', 2027).maybeSingle(),
        supabase.rpc('is_demo_account' as any, { _user_id: user.id }),
      ]);
      if (!off) setInList(!!demo || ((s as any)?.selling_agent_ids ?? []).includes(user.id));
    })();
    return () => { off = true; };
  }, [user?.id, loading, exempt]);
  if (!user || loading) return null;
  return exempt ? true : inList;
}
