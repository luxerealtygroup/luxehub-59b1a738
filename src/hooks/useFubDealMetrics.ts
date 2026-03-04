import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';

// ── Single source of truth for stage classification ──────────────────────
export const CLOSED_STAGES = ['closed', 'won', 'sold', 'settled', 'completed'];
export const PENDING_STAGES = ['pending', 'under contract', 'conditional', 'offer'];
export const ACTIVE_LISTING_STAGES = ['active', 'listed', 'live', 'on market', 'coming soon', 'pre-market', 'offer'];

export const classifyStage = (stageName: string): 'closed' | 'pending' | 'other' => {
  const s = (stageName || '').toLowerCase();
  if (CLOSED_STAGES.some(cs => s.includes(cs))) return 'closed';
  if (PENDING_STAGES.some(ps => s.includes(ps))) return 'pending';
  return 'other';
};

// ── Deal-side inference ──────────────────────────────────────────────────
/** Infer whether a deal is listing/seller-side or buyer-side.
 *  Returns 'listing', 'buyer', or 'unknown'. */
export function inferDealSide(deal: any): 'listing' | 'buyer' | 'unknown' {
  const pipeline = (deal.pipelineName || '').toLowerCase();
  const name = (deal.name || '').toLowerCase();

  // Explicit pipeline indicators
  if (pipeline.includes('seller') || pipeline.includes('listing')) return 'listing';
  if (pipeline.includes('buyer')) return 'buyer';

  // Deal name fallback
  if (name.includes('listing') || name.includes('seller')) return 'listing';
  if (name.includes('buyer') || name.includes('purchase')) return 'buyer';

  // Property fields present suggest listing side
  if (deal.propertyStreet || deal.propertyCity) return 'listing';

  return 'unknown';
}

/** Check if a deal qualifies as an Active Listing.
 *  "offer" stage deals are ONLY active listings if they are listing/seller-side. */
export function isActiveListingDeal(deal: any): boolean {
  const s = (deal.stageName || '').toLowerCase();
  const isOfferStage = s.includes('offer');

  // Non-offer active listing stages: always count
  const isNonOfferActive = ACTIVE_LISTING_STAGES
    .filter(als => als !== 'offer')
    .some(als => s.includes(als));

  if (isNonOfferActive) return true;

  // Offer stage: only count if listing/seller side
  if (isOfferStage) {
    const side = inferDealSide(deal);
    return side === 'listing'; // exclude 'buyer' and 'unknown'
  }

  return false;
}

/** Debug info for active listing classification */
export interface ActiveListingDebugInfo {
  stagesIncluded: string[];
  offerDealsIncluded: number;
  offerDealsExcludedBuyerSide: number;
  offerDealsUnclassified: number;
  totalActiveListings: number;
  top10: { id: number; stage: string; pipeline: string; inferredSide: string }[];
}

// ── Extract the best "close date" from a FUB deal ────────────────────────
/** FUB deals may include closedDate, projectedCloseDate, or createdAt.
 *  We pick the first available for closed-deal date filtering.
 *  NEVER use createdAt for closed deals. */
const getCloseDate = (deal: any): string | null => {
  return deal.closedDate || deal.closeDate || deal.projectedCloseDate || null;
};

// ── Types ────────────────────────────────────────────────────────────────
export interface DealMetrics {
  deals_closed: number;
  deals_pending: number;
  gci_earned: number;
  gci_pending: number;
}

export interface DebugInfo {
  effectiveAgentName: string | null;
  targetFubUserId: number | null;
  dateRangeStart: string;
  dateRangeEnd: string;
  closedStageList: string[];
  pendingStageList: string[];
  closeDateField: string;
  totalDealsForAgent: number;
  dealsInDateRange: number;
  dealsInClosedStages: number;
  dealsInClosedStagesAndDateRange: number;
  distinctStageValues: string[];
  source: 'fub' | 'local' | 'manual';
}

interface UseFubDealMetricsOptions {
  userId: string | null;
  fubUserId: number | null;
  year?: number;
  hasFUB?: boolean;
  agentName?: string | null;
  /** Optional override for date range start (YYYY-MM-DD). Defaults to Jan 1 of `year`. */
  dateStart?: string | null;
  /** Optional override for date range end (YYYY-MM-DD). Defaults to Dec 31 of `year`. */
  dateEnd?: string | null;
}

export function useFubDealMetrics({
  userId,
  fubUserId,
  year = new Date().getFullYear(),
  hasFUB = false,
  agentName = null,
  dateStart = null,
  dateEnd = null,
}: UseFubDealMetricsOptions) {
  const [metrics, setMetrics] = useState<DealMetrics>({
    deals_closed: 0, deals_pending: 0, gci_earned: 0, gci_pending: 0,
  });
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [allDeals, setAllDeals] = useState<FUBDeal[]>([]);

  const dateRangeStart = dateStart || `${year}-01-01`;
  const dateRangeEnd = dateEnd || `${year}-12-31`;

  const fetchMetrics = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    // Resolve FUB user id
    let targetFubUserId = fubUserId;
    if (!targetFubUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('fub_user_id')
        .eq('id', userId)
        .maybeSingle();
      targetFubUserId = profile?.fub_user_id ?? null;
    }

    const debug: DebugInfo = {
      effectiveAgentName: agentName,
      targetFubUserId,
      dateRangeStart,
      dateRangeEnd,
      closedStageList: CLOSED_STAGES,
      pendingStageList: PENDING_STAGES,
      closeDateField: 'closedDate → projectedCloseDate (fallback)',
      totalDealsForAgent: 0,
      dealsInDateRange: 0,
      dealsInClosedStages: 0,
      dealsInClosedStagesAndDateRange: 0,
      distinctStageValues: [],
      source: 'local',
    };

    let dealsClosed = 0;
    let dealsPending = 0;
    let gciEarned = 0;
    let gciPending = 0;

    if (targetFubUserId) {
      debug.source = 'fub';
      try {
        // Fetch all deal pages
        const pageSize = 100;
        const maxPages = 10;
        const collected: FUBDeal[] = [];

        for (let page = 0; page < maxPages; page++) {
          const offset = page * pageSize;
          const response = await followUpBossApi.getDeals(pageSize, offset);
          if (!response.success || !response.data?.deals) break;
          collected.push(...response.data.deals);
          if (response.data.deals.length < pageSize) break;
        }

        // Filter to this agent's deals
        const agentDeals = collected.filter((d: any) =>
          d.users?.some((u: any) => u.id === targetFubUserId) ||
          d.assignedUserId === targetFubUserId ||
          d.userId === targetFubUserId
        );

        debug.totalDealsForAgent = agentDeals.length;

        // Collect distinct stages
        debug.distinctStageValues = [...new Set(agentDeals.map(d => d.stageName || 'null'))];

        // (a) Deals in date range (using close date)
        const dealsInDateRange = agentDeals.filter(d => {
          const closeDate = getCloseDate(d);
          if (!closeDate) return false;
          return closeDate >= dateRangeStart && closeDate <= dateRangeEnd;
        });
        debug.dealsInDateRange = dealsInDateRange.length;

        // (b) Deals in closed stages (no date filter)
        const dealsInClosedStages = agentDeals.filter(d => classifyStage(d.stageName) === 'closed');
        debug.dealsInClosedStages = dealsInClosedStages.length;

        // (c) CLOSED = closed stage + close date in year
        const closedInYear = dealsInClosedStages.filter(d => {
          const closeDate = getCloseDate(d);
          if (!closeDate) return false;
          return closeDate >= dateRangeStart && closeDate <= dateRangeEnd;
        });
        debug.dealsInClosedStagesAndDateRange = closedInYear.length;

        dealsClosed = closedInYear.length;
        gciEarned = closedInYear.reduce((sum, d) => sum + Number(d.agentCommission || 0), 0);

        // (d) PENDING = pending stage, NOT in closed stages, any date
        const pendingDeals = agentDeals.filter(d => {
          const stage = classifyStage(d.stageName);
          return stage === 'pending';
        });
        dealsPending = pendingDeals.length;
        gciPending = pendingDeals.reduce((sum, d) => sum + Number(d.agentCommission || 0), 0);

        setAllDeals(agentDeals);
      } catch (err) {
        console.error('Error fetching FUB deals for metrics:', err);
      }
    } else {
      // Non-FUB: use local DB + manual_production overlay
      debug.source = 'local';
      const [closedRes, pendingRes, paidRes, pendingCommRes, mpRes] = await Promise.all([
        supabase.from('deals').select('id').eq('user_id', userId).eq('stage', 'closed'),
        supabase.from('deals').select('id').eq('user_id', userId).in('stage', ['under_contract', 'offer']),
        supabase.from('commissions').select('gross_commission, amount').eq('user_id', userId).eq('status', 'paid'),
        supabase.from('commissions').select('gross_commission, amount').eq('user_id', userId).eq('status', 'pending'),
        supabase.from('manual_production').select('*').eq('user_id', userId).eq('year', year),
      ]);

      dealsClosed = closedRes.data?.length || 0;
      dealsPending = pendingRes.data?.length || 0;
      gciEarned = paidRes.data?.reduce((s, c) => s + Number(c.gross_commission || c.amount || 0), 0) || 0;
      gciPending = pendingCommRes.data?.reduce((s, c) => s + Number(c.gross_commission || c.amount || 0), 0) || 0;

      // Manual production overlay
      if (mpRes.data && mpRes.data.length > 0) {
        debug.source = 'manual';
        const mp = mpRes.data.reduce(
          (acc, r) => ({
            closed_deals: acc.closed_deals + (r.closed_deals ?? 0),
            pending_deals: acc.pending_deals + (r.pending_deals ?? 0),
            gci_closed: acc.gci_closed + Number(r.gci_closed || 0),
            gci_pending: acc.gci_pending + Number(r.gci_pending || 0),
          }),
          { closed_deals: 0, pending_deals: 0, gci_closed: 0, gci_pending: 0 }
        );
        if (mp.closed_deals > dealsClosed) dealsClosed = mp.closed_deals;
        if (mp.pending_deals > dealsPending) dealsPending = mp.pending_deals;
        if (mp.gci_closed > gciEarned) gciEarned = mp.gci_closed;
        if (mp.gci_pending > gciPending) gciPending = mp.gci_pending;
      }

      debug.totalDealsForAgent = dealsClosed + dealsPending;
      debug.dealsInClosedStagesAndDateRange = dealsClosed;
    }

    setMetrics({ deals_closed: dealsClosed, deals_pending: dealsPending, gci_earned: gciEarned, gci_pending: gciPending });
    setDebugInfo(debug);
    setLoading(false);
  }, [userId, fubUserId, year, agentName, dateRangeStart, dateRangeEnd, dateStart, dateEnd]);

  useEffect(() => {
    setLoading(true);
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, debugInfo, loading, allDeals, refetch: fetchMetrics };
}
