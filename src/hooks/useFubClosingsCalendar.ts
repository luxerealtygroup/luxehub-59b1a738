import { useCallback, useEffect, useState } from 'react';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { classifyStage } from '@/hooks/useFubDealMetrics';
import { inferDealCategory, DealMetadataMap } from '@/lib/utils/dealWeight';
import { fetchDealAttribution, resolveDealShares, DealAttributionMap } from '@/lib/dealAttribution';

export type ClosingDateSource = 'closedDate' | 'closeDate' | 'projectedCloseDate';
export type ClosingStatus = 'closed' | 'forecast';

export interface ClosingEntry {
  id: number;
  /** Unique per credited agent — a split deal produces one entry per agent. */
  entryKey: string;
  name: string;
  address: string;
  date: string; // YYYY-MM-DD
  dateSource: ClosingDateSource;
  agentFubUserId: number | null;
  agentName: string;
  /** This agent's share of the deal, 0-100. 100 when it is not split. */
  sharePercent: number;
  stageName: string;
  pipelineName: string;
  price: number;
  /** Already prorated to this agent's share. */
  gci: number;
  category: 'sale' | 'lease';
  status: ClosingStatus;
  raw: FUBDeal;
}

function resolveCloseDate(deal: any): { date: string | null; source: ClosingDateSource | null } {
  if (deal.closedDate) return { date: String(deal.closedDate).slice(0, 10), source: 'closedDate' };
  if (deal.closeDate) return { date: String(deal.closeDate).slice(0, 10), source: 'closeDate' };
  if (deal.projectedCloseDate) return { date: String(deal.projectedCloseDate).slice(0, 10), source: 'projectedCloseDate' };
  return { date: null, source: null };
}

// Prefer the agent's split (`agentCommission`) over the deal's gross commission.
const getGci = (d: any): number => {
  const agent = Number(d.agentCommission ?? 0) || 0;
  if (agent > 0) return agent;
  return Number(d.commissionValue ?? 0) || 0;
};

function getAddress(d: any): string {
  // Prefer FUB custom address fields when present, otherwise fall back to deal name.
  const street = d.customClarityNOWAddress || d.propertyStreet || '';
  const city = d.customClarityNOWCity || d.propertyCity || '';
  if (street && city) return `${street}, ${city}`;
  if (street) return street;
  if (city) return city;
  return d.name || '(no address)';
}

interface Options {
  year: number;
  dealMetadataMap?: DealMetadataMap;
  /** Optional map of FUB user id → display name for unassigned/fallback resolution. */
  agentNameByFubId?: Map<number, string>;
}

export function useFubClosingsCalendar({ year, dealMetadataMap, agentNameByFubId }: Options) {
  const [deals, setDeals] = useState<ClosingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const collected: FUBDeal[] = [];
    let attribution: DealAttributionMap = new Map();
    try {
      // Edge function paginates server-side and returns the full set in one call.
      // Doing additional client-side pagination here causes duplicates.
      const [resp, attr] = await Promise.all([
        followUpBossApi.getDeals(100, 0),
        fetchDealAttribution(),
      ]);
      attribution = attr;
      if (resp.success && resp.data?.deals) {
        collected.push(...resp.data.deals);
      }
    } catch (err) {
      console.error('useFubClosingsCalendar fetch error:', err);
    }

    const entries: ClosingEntry[] = [];
    for (const d of collected as any[]) {
      const { date, source } = resolveCloseDate(d);
      if (!date || !source) continue;
      if (date < start || date > end) continue;
      const stageClass = classifyStage(d.stageName);
      // Include closed (actuals) + forecast stages (pending/offer/listed/other with a date).
      // Credit the recorded producing agent(s); only fall back to Follow Up Boss order
      // when nobody has been recorded, since FUB may list the operations admin first.
      // A split deal produces one entry per agent, each holding only their share.
      const category = inferDealCategory(d, dealMetadataMap).category;
      const fullGci = getGci(d);
      for (const share of resolveDealShares(d, attribution)) {
        const fubUserId: number | null = share.fubUserId;
        const resolvedName =
          share.name ||
          (fubUserId != null ? agentNameByFubId?.get(fubUserId) : undefined) ||
          (fubUserId != null ? `Agent #${fubUserId}` : 'Unassigned');
        entries.push({
          id: d.id,
          entryKey: `${d.id}:${fubUserId ?? share.profileId ?? 'none'}`,
          name: d.name || '(unnamed deal)',
          address: getAddress(d),
          date,
          dateSource: source,
          agentFubUserId: fubUserId,
          agentName: resolvedName,
          sharePercent: share.percent,
          stageName: d.stageName || '',
          pipelineName: d.pipelineName || '',
          price: Number(d.price || 0),
          gci: (fullGci * share.percent) / 100,
          category,
          status: stageClass === 'closed' ? 'closed' : 'forecast',
          raw: d,
        });
      }
    }
    setDeals(entries);
    setLoading(false);
  }, [year, dealMetadataMap, agentNameByFubId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { deals, loading, refetch: fetchAll };
}