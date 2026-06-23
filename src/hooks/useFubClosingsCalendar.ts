import { useCallback, useEffect, useState } from 'react';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { classifyStage } from '@/hooks/useFubDealMetrics';
import { inferDealCategory, DealMetadataMap } from '@/lib/utils/dealWeight';

export type ClosingDateSource = 'closedDate' | 'closeDate' | 'projectedCloseDate';

export interface ClosingEntry {
  id: number;
  name: string;
  date: string; // YYYY-MM-DD
  dateSource: ClosingDateSource;
  agentFubUserId: number | null;
  agentName: string;
  stageName: string;
  pipelineName: string;
  price: number;
  gci: number;
  category: 'sale' | 'lease';
  raw: FUBDeal;
}

function resolveCloseDate(deal: any): { date: string | null; source: ClosingDateSource | null } {
  if (deal.closedDate) return { date: String(deal.closedDate).slice(0, 10), source: 'closedDate' };
  if (deal.closeDate) return { date: String(deal.closeDate).slice(0, 10), source: 'closeDate' };
  if (deal.projectedCloseDate) return { date: String(deal.projectedCloseDate).slice(0, 10), source: 'projectedCloseDate' };
  return { date: null, source: null };
}

const getGci = (d: any): number => Number(d.commissionValue ?? d.agentCommission ?? 0) || 0;

interface Options {
  year: number;
  dealMetadataMap?: DealMetadataMap;
}

export function useFubClosingsCalendar({ year, dealMetadataMap }: Options) {
  const [deals, setDeals] = useState<ClosingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const pageSize = 100;
    const maxPages = 10;
    const collected: FUBDeal[] = [];
    try {
      for (let page = 0; page < maxPages; page++) {
        const resp = await followUpBossApi.getDeals(pageSize, page * pageSize);
        if (!resp.success || !resp.data?.deals) break;
        collected.push(...resp.data.deals);
        if (resp.data.deals.length < pageSize) break;
      }
    } catch (err) {
      console.error('useFubClosingsCalendar fetch error:', err);
    }

    const entries: ClosingEntry[] = [];
    for (const d of collected as any[]) {
      if (classifyStage(d.stageName) !== 'closed') continue;
      const { date, source } = resolveCloseDate(d);
      if (!date || !source) continue;
      if (date < start || date > end) continue;
      const user = Array.isArray(d.users) && d.users.length > 0 ? d.users[0] : null;
      const category = inferDealCategory(d, dealMetadataMap).category;
      entries.push({
        id: d.id,
        name: d.name || '(unnamed deal)',
        date,
        dateSource: source,
        agentFubUserId: user?.id ?? d.assignedUserId ?? d.userId ?? null,
        agentName: user?.name || 'Unassigned',
        stageName: d.stageName || '',
        pipelineName: d.pipelineName || '',
        price: Number(d.price || 0),
        gci: getGci(d),
        category,
        raw: d,
      });
    }
    setDeals(entries);
    setLoading(false);
  }, [year, dealMetadataMap]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { deals, loading, refetch: fetchAll };
}