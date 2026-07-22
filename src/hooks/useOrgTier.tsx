import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type OrgTier = 'free' | 'pro' | 'pro_plus' | 'team';

interface OrgTierResult {
  tier: OrgTier | null;
  loading: boolean;
  orgId: string | null;
  isOriginalOrg: boolean;
  canAccessCRMConnections: boolean;
  canAccessClientPortals: boolean;
  canAccessCompanyDashboard: boolean;
  canAccessCompanyBusinessPlanning: boolean;
  canAccessBranding: boolean;
  canAccessNominations: boolean;
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
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isOriginalOrg, setIsOriginalOrg] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) {
          setTier(null);
          setOrgId(null);
          setIsOriginalOrg(false);
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
          setOrgId(null);
          setIsOriginalOrg(false);
          setLoading(false);
        }
        return;
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('tier, is_original_org')
        .eq('id', orgId)
        .maybeSingle();

      if (!cancelled) {
        const row = org as { tier: OrgTier; is_original_org: boolean } | null;
        setTier(row?.tier ?? null);
        setIsOriginalOrg(Boolean(row?.is_original_org));
        setOrgId(orgId);
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
    orgId,
    isOriginalOrg,
    canAccessCRMConnections: tier === 'pro' || tier === 'pro_plus' || tier === 'team',
    canAccessClientPortals: tier === 'pro_plus' || tier === 'team',
    canAccessCompanyDashboard: tier === 'team',
    canAccessCompanyBusinessPlanning: tier === 'team',
    canAccessBranding: tier === 'team',
    canAccessNominations: isOriginalOrg,
  };
}