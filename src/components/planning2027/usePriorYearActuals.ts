import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFubDealMetrics } from '@/hooks/useFubDealMetrics';
import { useDealMetadata } from '@/hooks/useDealMetadata';

export interface PriorYearActuals {
  loading: boolean;
  gci: number;
  closedSales: number;
  avgSalePrice: number | null;
  commissionRate: number | null;
  apptToClose: number | null;
  leadToAppt: number | null;
  appointments: number;
  leads: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 2026 actuals: closings/GCI/volume from Follow Up Boss deals, appointments and leads from weekly 4-1-1. */
export function usePriorYearActuals(userId: string | null, fubUserId: number | null, hasFUB: boolean, agentName: string | null): PriorYearActuals {
  const { metadata } = useDealMetadata();
  const { metrics, loading: dealsLoading } = useFubDealMetrics({
    userId, fubUserId, year: 2026, hasFUB, agentName,
    dateStart: '2026-01-01', dateEnd: '2026-12-31', dealMetadataMap: metadata,
  });
  const [w, setW] = useState<{ appts: number; leads: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from('weekly_411')
      .select('appointments_held, appointments_actual, appointments_set, new_leads, leads_received')
      .eq('user_id', userId).gte('week_start_date', '2026-01-01').lte('week_start_date', '2026-12-31')
      .then(({ data }) => {
        if (cancelled) return;
        let appts = 0, leads = 0;
        for (const r of data || []) {
          appts += Number(r.appointments_held || r.appointments_actual || r.appointments_set || 0);
          leads += Number(r.new_leads || r.leads_received || 0);
        }
        setW({ appts, leads });
      });
    return () => { cancelled = true; };
  }, [userId]);

  const sales = metrics.sales_count_closed;
  const vol = metrics.sales_volume_closed;
  const closings = metrics.deals_closed;
  const appts = w?.appts ?? 0;
  const leads = w?.leads ?? 0;
  return {
    loading: dealsLoading || !w,
    gci: Math.round(metrics.gci_earned),
    closedSales: sales,
    avgSalePrice: sales >= 2 && vol > 0 ? Math.round(vol / sales) : null,
    commissionRate: sales >= 2 && vol > 0 && metrics.gci_sales_closed > 0 ? round1((metrics.gci_sales_closed / vol) * 100) : null,
    apptToClose: appts >= 5 && closings > 0 ? round1(Math.min(100, (closings / appts) * 100)) : null,
    leadToAppt: leads >= 20 && appts > 0 ? round1(Math.min(100, (appts / leads) * 100)) : null,
    appointments: appts,
    leads,
  };
}
