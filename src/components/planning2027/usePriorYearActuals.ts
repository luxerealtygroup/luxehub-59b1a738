import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFubDealMetrics } from '@/hooks/useFubDealMetrics';
import { useDealMetadata } from '@/hooks/useDealMetadata';

export interface PriorYearActuals {
  loading: boolean;
  gci: number;
  gciSales: number;
  volume: number;
  closings: number;
  closedSales: number;
  avgSalePrice: number | null;
  commissionRate: number | null;
  apptToClose: number | null;
  leadToAppt: number | null;
  /** Raw (unthresholded) conversion rates for display */
  apptToCloseRaw: number | null;
  leadToApptRaw: number | null;
  appointments: number;
  leads: number;
  conversations: number;
  listings: number;
  offers: number;
  weeksLogged: number;
  /** Why the agent's own conversion rates were or weren't used. */
  rateNote: string | null;
}

/** Minimum weekly 4-1-1 entries before an agent's own conversion rates are trusted. */
export const MIN_WEEKS_FOR_RATES = 12;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 2026 actuals: closings/GCI/volume from Follow Up Boss deals, activity from weekly 4-1-1. */
export function usePriorYearActuals(userId: string | null, fubUserId: number | null, hasFUB: boolean, agentName: string | null): PriorYearActuals {
  const { metadata } = useDealMetadata();
  const { metrics, loading: dealsLoading } = useFubDealMetrics({
    userId, fubUserId, year: 2026, hasFUB, agentName,
    dateStart: '2026-01-01', dateEnd: '2026-12-31', dealMetadataMap: metadata,
  });
  const [w, setW] = useState<{ appts: number; leads: number; convos: number; listings: number; offers: number; weeks: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from('weekly_411')
      .select('appointments_held, appointments_actual, appointments_set, new_leads, leads_received, conversations, contacts_made, listings_actual, contracts_actual, contracts_signed')
      .eq('user_id', userId).gte('week_start_date', '2026-01-01').lte('week_start_date', '2026-12-31')
      .then(({ data }) => {
        if (cancelled) return;
        const t = { appts: 0, leads: 0, convos: 0, listings: 0, offers: 0, weeks: (data || []).length };
        for (const r of data || []) {
          t.appts += Number(r.appointments_held || r.appointments_actual || r.appointments_set || 0);
          t.leads += Number(r.new_leads || r.leads_received || 0);
          t.convos += Number(r.conversations || r.contacts_made || 0);
          t.listings += Number(r.listings_actual || 0);
          t.offers += Number(r.contracts_actual || r.contracts_signed || 0);
        }
        setW(t);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const sales = metrics.sales_count_closed;
  const vol = metrics.sales_volume_closed;
  const closings = metrics.deals_closed;
  const appts = w?.appts ?? 0;
  const leads = w?.leads ?? 0;
  const weeks = w?.weeks ?? 0;
  const ratesTrusted = weeks >= MIN_WEEKS_FOR_RATES && leads >= appts && appts > 0;
  const rateNote = ratesTrusted ? null
    : weeks < MIN_WEEKS_FOR_RATES ? `Only ${weeks} weeks of 4-1-1 logged (need ${MIN_WEEKS_FOR_RATES}) — using team defaults`
    : `4-1-1 shows fewer leads (${leads}) than appointments (${appts}) — using team defaults`;
  const a2cRaw = appts > 0 ? round1(Math.min(100, (closings / appts) * 100)) : null;
  const l2aRaw = leads > 0 ? round1(Math.min(100, (appts / leads) * 100)) : null;
  return {
    loading: dealsLoading || !w,
    gci: Math.round(metrics.gci_earned),
    gciSales: Math.round(metrics.gci_sales_closed),
    volume: Math.round(vol),
    closings,
    closedSales: sales,
    avgSalePrice: sales >= 2 && vol > 0 ? Math.round(vol / sales) : null,
    commissionRate: sales >= 2 && vol > 0 && metrics.gci_sales_closed > 0 ? round1((metrics.gci_sales_closed / vol) * 100) : null,
    apptToClose: ratesTrusted && closings > 0 ? a2cRaw : null,
    leadToAppt: ratesTrusted ? l2aRaw : null,
    apptToCloseRaw: a2cRaw,
    leadToApptRaw: l2aRaw,
    appointments: appts,
    leads,
    conversations: w?.convos ?? 0,
    listings: w?.listings ?? 0,
    offers: w?.offers ?? 0,
    weeksLogged: weeks,
    rateNote,
  };
}

export interface PriorYearGoal { deals: number | null; gci: number | null; volume: number | null; source: string | null }

/** The agent's 2026 goal: production_goals first, then yearly agent_goals. */
export function usePriorYearGoal(userId: string | null): PriorYearGoal | null {
  const [g, setG] = useState<PriorYearGoal | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [pg, ag] = await Promise.all([
        supabase.from('production_goals').select('annual_units_goal, annual_gci_goal, annual_volume_goal').eq('user_id', userId).eq('year', 2026).maybeSingle(),
        supabase.from('agent_goals').select('goal_type, target_value, start_date').eq('user_id', userId).eq('period', 'yearly')
          .gte('start_date', '2025-12-01').lte('start_date', '2026-12-31'),
      ]);
      if (cancelled) return;
      const p = pg.data as any;
      if (p && (p.annual_gci_goal || p.annual_units_goal)) {
        setG({ deals: p.annual_units_goal ?? null, gci: p.annual_gci_goal ?? null, volume: p.annual_volume_goal ?? null, source: 'Production goals' });
        return;
      }
      const rows = (ag.data as any[]) ?? [];
      const rev = rows.find(r => r.goal_type === 'revenue')?.target_value ?? null;
      const deals = rows.find(r => r.goal_type === 'deals_closed')?.target_value ?? null;
      setG(rev || deals ? { deals, gci: rev, volume: null, source: 'Goals page' } : { deals: null, gci: null, volume: null, source: null });
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return g;
}
