import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { CalendarQuarter, rollingCalendarQuarters } from '@/lib/pipelineQuarters';

interface PipelineRow {
  id: string;
  user_id: string;
  stage: number;
  status: string | null;
  client_type: string | null;
  deal_category: string | null;
  projected_sale_amount: number | null;
  projected_gci: number | null;
  expected_pending_date: string | null;
  fub_deal_close_date: string | null;
  fub_deal_stage: string | null;
  fub_deal_price: number | null;
  created_at: string;
}

export interface QuarterPipelineMetrics {
  units: number;
  volume: number;
  gci: number;
  pending: number;
  conditional: number;
  closed: number;
  undated: number;
}

export interface QuarterPipelineSummary {
  current: CalendarQuarter & QuarterPipelineMetrics;
  next: CalendarQuarter & QuarterPipelineMetrics;
  combined: QuarterPipelineMetrics;
  combinedLabel: string;
  cohortYear: number;
}

const emptyMetrics = (): QuarterPipelineMetrics => ({
  units: 0,
  volume: 0,
  gci: 0,
  pending: 0,
  conditional: 0,
  closed: 0,
  undated: 0,
});

const isLease = (row: PipelineRow) =>
  row.deal_category === 'lease' || row.client_type === 'tenant' || row.client_type === 'landlord';

const rowWeight = (row: PipelineRow) => (isLease(row) ? 1 / 3 : 1);

const classifyRow = (row: PipelineRow): 'pending' | 'conditional' | 'closed' | 'active' => {
  const state = `${row.fub_deal_stage || ''} ${row.status || ''}`.toLowerCase();
  if (/closed|won|sold|settled|completed/.test(state)) return 'closed';
  if (/conditional|offer/.test(state) || Number(row.stage) === 8) return 'conditional';
  if (/pending|under contract/.test(state) || Number(row.stage) === 9) return 'pending';
  return 'active';
};

const addRow = (metrics: QuarterPipelineMetrics, row: PipelineRow) => {
  metrics.units += rowWeight(row);
  metrics.volume += Number(row.fub_deal_price ?? row.projected_sale_amount ?? 0);
  metrics.gci += Number(row.projected_gci ?? 0);
  const state = classifyRow(row);
  if (state === 'pending') metrics.pending += rowWeight(row);
  if (state === 'conditional') metrics.conditional += rowWeight(row);
  if (state === 'closed') metrics.closed += rowWeight(row);
};

const roundMetrics = (metrics: QuarterPipelineMetrics): QuarterPipelineMetrics => ({
  ...metrics,
  units: Math.round(metrics.units * 100) / 100,
  pending: Math.round(metrics.pending * 100) / 100,
  conditional: Math.round(metrics.conditional * 100) / 100,
  closed: Math.round(metrics.closed * 100) / 100,
});

export function useQuarterlyPipelineSummary(agentUserId?: string | null) {
  const { orgId } = useTenant();
  const periods = useMemo(() => rollingCalendarQuarters(), []);
  const [summary, setSummary] = useState<QuarterPipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from('pipeline_clients')
      .select('id, user_id, stage, status, client_type, deal_category, projected_sale_amount, projected_gci, expected_pending_date, fub_deal_close_date, fub_deal_stage, fub_deal_price, created_at')
      .eq('org_id', orgId)
      .gte('created_at', `${periods.current.year}-01-01T00:00:00`)
      .lt('created_at', `${periods.current.year + 1}-01-01T00:00:00`)
      .gte('stage', 1)
      .lte('stage', 9);
    if (agentUserId) query = query.eq('user_id', agentUserId);

    const { data, error } = await query;
    if (error) {
      console.error('Quarterly pipeline summary failed to load:', error);
      setSummary(null);
      setLoading(false);
      return;
    }

    const current = emptyMetrics();
    const next = emptyMetrics();
    (data as PipelineRow[] | null)?.forEach((row) => {
      const closeDate = row.fub_deal_close_date || row.expected_pending_date;
      if (!closeDate) {
        current.undated += 1;
        return;
      }
      if (closeDate >= periods.current.start && closeDate <= periods.current.end) addRow(current, row);
      if (closeDate >= periods.next.start && closeDate <= periods.next.end) addRow(next, row);
    });

    const roundedCurrent = roundMetrics(current);
    const roundedNext = roundMetrics(next);
    setSummary({
      current: { ...periods.current, ...roundedCurrent },
      next: { ...periods.next, ...roundedNext },
      combined: roundMetrics({
        units: roundedCurrent.units + roundedNext.units,
        volume: roundedCurrent.volume + roundedNext.volume,
        gci: roundedCurrent.gci + roundedNext.gci,
        pending: roundedCurrent.pending + roundedNext.pending,
        conditional: roundedCurrent.conditional + roundedNext.conditional,
        closed: roundedCurrent.closed + roundedNext.closed,
        undated: roundedCurrent.undated,
      }),
      combinedLabel: periods.combinedLabel,
      cohortYear: periods.current.year,
    });
    setLoading(false);
  }, [agentUserId, orgId, periods]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}
