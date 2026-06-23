import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { sumWeightedDeals, buildWeightedDebug, WeightedDebugInfo, DealMetadataMap } from '@/lib/utils/dealWeight';
import { inferDealCategory } from '@/lib/utils/dealWeight';

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

export const isConditionalStage = (stageName: string): boolean => {
  const s = (stageName || '').toLowerCase();
  return s.includes('conditional') || s.includes('offer');
};

const getDealGci = (deal: any): number => Number(deal.commissionValue ?? deal.agentCommission ?? 0) || 0;

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
  /** Sum of sale price for closed deals (volume) */
  sales_volume_closed: number;
  /** Weighted deal counts (leases = 0.33) */
  weighted_closed: number;
  weighted_pending: number;
  weighted_debug_closed: WeightedDebugInfo | null;
  weighted_debug_pending: WeightedDebugInfo | null;
  /** Number of closed deals that are actual sales (excludes leases) */
  sales_count_closed: number;
  /** Number of closed deals that are leases */
  lease_count_closed: number;
  /** GCI earned from sales only (excludes leases) */
  gci_sales_closed: number;
  /** GCI earned from leases only */
  gci_leases_closed: number;
  /** Number of pending sales, excluding leases and conditional/offer stages */
  sales_count_pending: number;
  /** Number of pending leases */
  lease_count_pending: number;
  /** Number of conditional/offer sales, excluding leases */
  sales_count_conditional: number;
  /** Pending sales GCI, excluding leases and conditional/offer stages */
  gci_sales_pending: number;
  /** Pending leases GCI */
  gci_leases_pending: number;
  /** Conditional/offer sales GCI, excluding leases */
  gci_sales_conditional: number;
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
  /** Deal metadata map for weight lookups */
  dealMetadataMap?: DealMetadataMap;
}

export function useFubDealMetrics({
  userId,
  fubUserId,
  year = new Date().getFullYear(),
  hasFUB = false,
  agentName = null,
  dateStart = null,
  dateEnd = null,
  dealMetadataMap,
}: UseFubDealMetricsOptions) {
  const [metrics, setMetrics] = useState<DealMetrics>({
    deals_closed: 0, deals_pending: 0, gci_earned: 0, gci_pending: 0,
    sales_volume_closed: 0,
    weighted_closed: 0, weighted_pending: 0, weighted_debug_closed: null, weighted_debug_pending: null,
    sales_count_closed: 0, lease_count_closed: 0, gci_sales_closed: 0, gci_leases_closed: 0,
    sales_count_pending: 0, lease_count_pending: 0, sales_count_conditional: 0,
    gci_sales_pending: 0, gci_leases_pending: 0, gci_sales_conditional: 0,
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
    let closedDealsArr: any[] = [];
    let pendingDealsArr: any[] = [];

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
        gciEarned = closedInYear.reduce((sum, d) => sum + getDealGci(d), 0);
        closedDealsArr = closedInYear;

        // (d) PENDING = pending stage, NOT in closed stages, any date
        const pendingDeals = agentDeals.filter(d => {
          const stage = classifyStage(d.stageName);
          return stage === 'pending';
        });
        dealsPending = pendingDeals.length;
        gciPending = pendingDeals.reduce((sum, d) => sum + getDealGci(d), 0);
        pendingDealsArr = pendingDeals;

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

    const weightedClosed = sumWeightedDeals(closedDealsArr, dealMetadataMap);
    const weightedPending = sumWeightedDeals(pendingDealsArr, dealMetadataMap);
    const salesVolumeClosed = closedDealsArr.reduce(
      (sum, d: any) => sum + Number(d.price || 0),
      0
    );
    const weightedDebugClosed = buildWeightedDebug(closedDealsArr, dealMetadataMap);
    const salesCountClosed = closedDealsArr.length > 0 ? weightedDebugClosed.saleCount : dealsClosed;
    // Split GCI by sale vs lease. Sales-only planning uses full GCI from closed,
    // pending, and conditional activity so early-year closed deals don't skew the average.
    let gciSalesClosed = 0;
    let gciLeasesClosed = 0;
    let leaseCountClosed = 0;
    let salesCountPending = 0;
    let leaseCountPending = 0;
    let salesCountConditional = 0;
    let gciSalesPending = 0;
    let gciLeasesPending = 0;
    let gciSalesConditional = 0;
    if (closedDealsArr.length > 0) {
      for (const d of closedDealsArr) {
        const cat = inferDealCategory(d, dealMetadataMap).category;
        const gci = getDealGci(d);
        if (cat === 'lease') { gciLeasesClosed += gci; leaseCountClosed++; }
        else { gciSalesClosed += gci; }
      }
    } else {
      // Local/manual fallback: treat everything as sales
      gciSalesClosed = gciEarned;
    }
    if (pendingDealsArr.length > 0) {
      for (const d of pendingDealsArr) {
        const cat = inferDealCategory(d, dealMetadataMap).category;
        const gci = getDealGci(d);
        if (cat === 'lease') {
          leaseCountPending++;
          gciLeasesPending += gci;
          continue;
        }
        if (isConditionalStage((d as any).stageName)) {
          salesCountConditional++;
          gciSalesConditional += gci;
        } else {
          salesCountPending++;
          gciSalesPending += gci;
        }
      }
    } else if (dealsPending > 0) {
      // Local/manual fallback: treat pending as sales when no FUB deal rows exist.
      salesCountPending = dealsPending;
      gciSalesPending = gciPending;
    }
    setMetrics({
      deals_closed: dealsClosed, deals_pending: dealsPending,
      gci_earned: gciEarned, gci_pending: gciPending,
      sales_volume_closed: salesVolumeClosed,
      weighted_closed: Math.round(weightedClosed * 100) / 100,
      weighted_pending: Math.round(weightedPending * 100) / 100,
      weighted_debug_closed: weightedDebugClosed,
      weighted_debug_pending: buildWeightedDebug(pendingDealsArr, dealMetadataMap),
      sales_count_closed: salesCountClosed,
      lease_count_closed: leaseCountClosed,
      gci_sales_closed: Math.round(gciSalesClosed),
      gci_leases_closed: Math.round(gciLeasesClosed),
      sales_count_pending: salesCountPending,
      sales_count_conditional: salesCountConditional,
      gci_sales_pending: Math.round(gciSalesPending),
      gci_sales_conditional: Math.round(gciSalesConditional),
    });
    setDebugInfo(debug);
    setLoading(false);
  }, [userId, fubUserId, year, agentName, dateRangeStart, dateRangeEnd, dateStart, dateEnd, dealMetadataMap]);

  useEffect(() => {
    setLoading(true);
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, debugInfo, loading, allDeals, refetch: fetchMetrics };
}
