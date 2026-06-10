import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PipelineMetrics {
  /** Total pipeline clients (all stages, no date filter) */
  totalClients: number;
  /** Clients with expected_pending_date in the given date range */
  clientsInDateRange: number;
  /** Clients missing expected_pending_date */
  missingDateCount: number;
  /** Debug info for admin panels */
  debug: PipelineDebug;
}

export interface PipelineDebug {
  effectiveUserId: string | null;
  dateRangeStart: string;
  dateRangeEnd: string;
  totalBeforeFilter: number;
  afterDateFilter: number;
  missingDateCount: number;
  top5: { id: string; client_name: string; stage: number; expected_pending_date: string | null }[];
}

interface UsePipelineMetricsOptions {
  userId: string | null;
  dateStart: string;
  dateEnd: string;
}

/**
 * Shared hook: single source of truth for pipeline_clients counts.
 * Used by both Pipeline tab and Business Planning.
 */
export function usePipelineMetrics({ userId, dateStart, dateEnd }: UsePipelineMetricsOptions) {
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    totalClients: 0,
    clientsInDateRange: 0,
    missingDateCount: 0,
    debug: {
      effectiveUserId: userId,
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      totalBeforeFilter: 0,
      afterDateFilter: 0,
      missingDateCount: 0,
      top5: [],
    },
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from('pipeline_clients')
      .select('id, client_name, stage, expected_pending_date, client_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const clients = data || [];
    // Weight tenants & landlords as 1/3 of a pipeline addition (3 = 1 unit).
    // Sales (buyer/seller) count as a full 1.0.
    const weightOf = (c: any) =>
      c.client_type === 'tenant' || c.client_type === 'landlord' ? 1 / 3 : 1;
    const sumWeighted = (arr: any[]) =>
      Math.round(arr.reduce((s, c) => s + weightOf(c), 0) * 100) / 100;

    const totalBeforeFilter = sumWeighted(clients);

    const missingDate = clients.filter(c => !c.expected_pending_date);
    const inRange = clients.filter(c => {
      if (!c.expected_pending_date) return false;
      return c.expected_pending_date >= dateStart && c.expected_pending_date <= dateEnd;
    });

    setMetrics({
      totalClients: totalBeforeFilter,
      clientsInDateRange: sumWeighted(inRange),
      missingDateCount: sumWeighted(missingDate),
      debug: {
        effectiveUserId: userId,
        dateRangeStart: dateStart,
        dateRangeEnd: dateEnd,
        totalBeforeFilter,
        afterDateFilter: sumWeighted(inRange),
        missingDateCount: sumWeighted(missingDate),
        top5: clients.slice(0, 5).map(c => ({
          id: c.id,
          client_name: c.client_name,
          stage: c.stage,
          expected_pending_date: c.expected_pending_date,
        })),
      },
    });
    setLoading(false);
  }, [userId, dateStart, dateEnd]);

  useEffect(() => { fetch(); }, [fetch]);

  return { ...metrics, loading, refetch: fetch };
}
