import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type OrgTier = 'free' | 'pro' | 'team';

interface OrgTierResult {
  tier: OrgTier | null;
  loading: boolean;
  canAccessCRMConnections: boolean;
  canAccessCompanyDashboard: boolean;
  canAccessBranding: boolean;
}

/**
 * Reads the current user's org tier via profiles.org_id -> organizations.tier
 * and exposes feature-gate booleans.
 *
 * Gating map:
 *   free -> none
 *   pro  -> canAccessCRMConnections
 *   team -> all of the above
 */
export function useOrgTier(): OrgTierResult {
  const { user } = useAuth();
  const [tier, setTier] = useState<OrgTier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) {
          setTier(null);
          setLoading(false);
        }
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
        if (!cancelled) {
          setTier(null);
          setLoading(false);
        }
        return;
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('tier')
        .eq('id', orgId)
        .maybeSingle();

      if (!cancelled) {
        setTier(((org as { tier: OrgTier } | null)?.tier ?? null));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    tier,
    loading,
    canAccessCRMConnections: tier === 'pro' || tier === 'team',
    canAccessCompanyDashboard: tier === 'team',
    canAccessBranding: tier === 'team',
  };
}