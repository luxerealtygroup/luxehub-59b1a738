import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { setDealWeightConfig } from '@/lib/utils/dealWeight';

/** Loads the org's lease threshold and weight from Planning settings into the shared deal-weight rule. */
export function DealWeightConfigLoader() {
  useEffect(() => {
    const load = () => supabase.from('planning_settings').select('lease_full_unit_gci, lease_weight').eq('plan_year', 2027).maybeSingle()
      .then(({ data }) => data && setDealWeightConfig({ leaseFullUnitGci: (data as any).lease_full_unit_gci, leaseWeight: (data as any).lease_weight }));
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
