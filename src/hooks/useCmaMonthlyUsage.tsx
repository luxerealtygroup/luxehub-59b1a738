import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgTier } from '@/hooks/useOrgTier';

const FREE_TIER_LIMIT = 5;

interface CmaMonthlyUsage {
  loading: boolean;
  used: number;
  limit: number;
  isFree: boolean;
  atLimit: boolean;
  onLastOne: boolean;
  refresh: () => Promise<void>;
}

/**
 * Counts CMA generations for the current user's org in the current calendar
 * month. Only meaningful for free-tier orgs — pro/team have no cap.
 */
export function useCmaMonthlyUsage(): CmaMonthlyUsage {
  const { user } = useAuth();
  const tier = useOrgTier();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const isFree = tier.tier === 'free';

  const refresh = useCallback(async () => {
    if (!user || tier.loading) return;
    if (!isFree) {
      setUsed(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) {
      setUsed(0);
      setLoading(false);
      return;
    }
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('cma_generations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', start.toISOString());
    setUsed(count ?? 0);
    setLoading(false);
  }, [user, tier.loading, isFree]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    loading: loading || tier.loading,
    used,
    limit: FREE_TIER_LIMIT,
    isFree,
    atLimit: isFree && used >= FREE_TIER_LIMIT,
    onLastOne: isFree && used === FREE_TIER_LIMIT - 1,
    refresh,
  };
}