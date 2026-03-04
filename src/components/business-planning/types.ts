import { FUBDeal } from '@/lib/api/followUpBoss';
import { DebugInfo, DealMetrics } from '@/hooks/useFubDealMetrics';
import { WeightedDebugInfo } from '@/lib/utils/dealWeight';

export const currentYear = 2026;

export const safe = (v: number | null | undefined) => Number(v) || 0;
export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
export const divide = (num: number, den: number) => (den > 0 ? Math.ceil(num / den) : 0);

export interface ActiveMetrics {
  ytdClosedDeals: number;
  ytdGCI: number;
  pendingGCI: number;
  activeListings: number;
  cmaToListingPct: number;
  apptToContractPct: number;
  contactToApptPct: number;
  dialsToApptPct: number;
  projectedYearEndGCI: number;
  gapToTarget: number;
  targetGCI: number;
  pendingDeals: number;
  avgCommission: number;
  weeklyAvgDials: number;
  weeklyAvgContacts: number;
  weeklyAvgAppts: number;
  weeklyAvgCMAs: number;
  totalCMAs: number;
  totalListings: number;
  totalAppts: number;
  totalContracts: number;
  totalContacts: number;
  totalDials: number;
  weeksOfData: number;
  // Weighted deal metrics
  weightedClosed: number;
  weightedPending: number;
  weightedDebugClosed: WeightedDebugInfo | null;
  weightedDebugPending: WeightedDebugInfo | null;
}

export interface GoalInputs {
  gci_target: number;
  avg_commission: number;
  split_percent: number;
  avg_sale_price: number;
  contact_to_appt_rate: number;
  appt_to_contract_rate: number;
  cma_to_listing_rate: number;
  dials_to_appt_rate: number;
}

export interface AISuggestion {
  label: string;
  closings: number;
  weeklyDials: number;
  weeklyContacts: number;
  weeklyAppts: number;
  weeklyCMAs: number;
  gci: number;
}

export interface AIInsight {
  text: string;
  type: 'warning' | 'info' | 'action';
}

export const defaultGoals: GoalInputs = {
  gci_target: 0, avg_commission: 15000, split_percent: 70,
  avg_sale_price: 500000, contact_to_appt_rate: 20,
  appt_to_contract_rate: 25, cma_to_listing_rate: 30, dials_to_appt_rate: 10,
};

export interface ActiveListingDebug {
  stagesIncluded: string[];
  offerDealsIncluded: number;
  offerDealsExcludedBuyerSide: number;
  offerDealsUnclassified: number;
  totalActiveListings: number;
  top10: { id: number; stage: string; pipeline: string; inferredSide: string }[];
}
