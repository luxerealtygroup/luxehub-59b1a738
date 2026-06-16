/**
 * Canonical Q-Pipeline Requirements.
 *
 * SINGLE SOURCE OF TRUTH for every "pipeline gap / sales needed / target / avg GCI"
 * number shown to the agent. Both PerformanceRealityTab and StrategyGoalsTab must
 * read from this — do not recompute these values anywhere else.
 *
 * All GCI figures returned are NET of the agent's team split.
 */

import { ActiveMetrics, GoalInputs } from './types';

export interface PipelineGapInputs {
  pipelineTotal: number;
  q1ClosedGci?: number;
  q2ClosedGci?: number;
  firmPendingGci?: number;
  conditionalGci?: number;
}

export interface Q3Requirements {
  // Agent split
  splitPct: number;
  splitFactor: number;
  netLabel: string;

  // Targets (NET)
  annualGoalNet: number;
  expectedMidyearNet: number;
  projectedH1ActualNet: number;
  midyearGap: number;
  isBehind: boolean;
  remainingGoalNet: number;
  q3ShareOfRemaining: number;
  q4ShareOfRemaining: number;
  q3CarryoverShare: number;
  adjustedQ3TargetNet: number;
  originalQ3GoalNet: number;
  surplusNet: number;

  // Averages (NET)
  avgGciPerSaleNet: number;
  avgGciPerClosedSaleNet: number;
  avgGciPerPendingSaleNet: number;
  usingConfirmedSaleAvg: boolean;
  saleAverageLooksLow: boolean;

  // Counts
  salesClosed: number;
  salesPending: number;
  salesConditional: number;
  confirmedSalesCount: number;
  inFlightSalesCount: number;

  // Pipeline math
  q3SalesNeeded: number;
  q3PipelineRequired: number;
  q3CurrentPipeline: number;
  q3PipelineGap: number;
  weeklyNewContacts: number;

  // Sanity
  annualDealGoal: number;
  q3DealCountUnreasonable: boolean;
}

// Constants — kept here so both tabs agree
const Q3_SHARE = 0.60;
const Q4_SHARE = 0.40;
const CLOSE_RATE = 0.30;          // 3 in 10 pipeline contacts close
const TEAM_AVG_GCI_FALLBACK = 15000;
const WEEKS_IN_QUARTER = 13;

export function computeQ3Requirements(
  metrics: ActiveMetrics | null,
  goals: GoalInputs,
  pipelineGapData: PipelineGapInputs,
): Q3Requirements {
  const splitPct = metrics?.splitPercent && metrics.splitPercent > 0
    ? metrics.splitPercent
    : (goals.split_percent > 0 ? goals.split_percent : 70);
  const splitFactor = splitPct / 100;
  const net = (v: number) => Math.round(v * splitFactor);
  const netLabel = `Your net GCI after team split (${splitPct}%)`;

  // ── Targets (NET) ──
  const annualGoalNet = net(metrics?.targetGCI || 0);
  const ytdClosedGciNet = net(metrics?.ytdGCI || 0);
  const firmPendingGciNet = net(pipelineGapData.firmPendingGci || 0);
  const conditionalGciNet = net(pipelineGapData.conditionalGci || 0);

  const expectedMidyearNet = annualGoalNet > 0 ? annualGoalNet / 2 : 0;
  const conditionalAt99 = conditionalGciNet * 0.99;
  const projectedH1ActualNet = ytdClosedGciNet + firmPendingGciNet + conditionalAt99;
  const midyearGap = expectedMidyearNet - projectedH1ActualNet;
  const isBehind = midyearGap > 0;
  const remainingGoalNet = Math.max(0, annualGoalNet - projectedH1ActualNet);
  const h1Carryover = isBehind ? midyearGap : 0;
  const q3ShareOfRemaining = remainingGoalNet * Q3_SHARE;
  const q4ShareOfRemaining = remainingGoalNet * Q4_SHARE;
  const q3CarryoverShare = h1Carryover * Q3_SHARE;
  const adjustedQ3TargetNet = q3ShareOfRemaining + q3CarryoverShare;
  const originalQ3GoalNet = annualGoalNet > 0 ? annualGoalNet / 4 : 0;
  const surplusNet = !isBehind ? Math.abs(midyearGap) : 0;

  // ── Averages (NET) ──
  const salesClosed = metrics?.salesCountClosed || 0;
  const salesPending = metrics?.salesCountPending || 0;
  const salesConditional = metrics?.salesCountConditional || 0;
  const confirmedSalesCount = salesClosed + salesPending + salesConditional;
  const inFlightSalesCount = salesPending + salesConditional;

  const usingConfirmedSaleAvg = confirmedSalesCount > 0 && (metrics?.avgGciPerSale || 0) > 0;
  const avgGciPerSaleNet = usingConfirmedSaleAvg ? net(metrics!.avgGciPerSale) : net(TEAM_AVG_GCI_FALLBACK);
  const avgGciPerClosedSaleNet = net(metrics?.avgGciPerClosedSale || 0);
  const avgGciPerPendingSaleNet = net(metrics?.avgGciPerPendingSale || 0);
  const saleAverageLooksLow = usingConfirmedSaleAvg && avgGciPerSaleNet < 5000;

  // ── Pipeline math ──
  const q3SalesNeeded = avgGciPerSaleNet > 0 ? Math.ceil(adjustedQ3TargetNet / avgGciPerSaleNet) : 0;
  const q3PipelineRequired = q3SalesNeeded > 0 ? Math.ceil(q3SalesNeeded / CLOSE_RATE) : 0;
  const q3CurrentPipeline = pipelineGapData.pipelineTotal;
  const q3PipelineGap = Math.max(0, q3PipelineRequired - q3CurrentPipeline);
  const weeklyNewContacts = q3PipelineGap > 0 ? Math.ceil(q3PipelineGap / WEEKS_IN_QUARTER) : 0;

  const annualDealGoal = avgGciPerSaleNet > 0 && annualGoalNet > 0
    ? Math.ceil(annualGoalNet / avgGciPerSaleNet)
    : 0;
  const q3DealCountUnreasonable = annualDealGoal > 0 && q3SalesNeeded > annualDealGoal;

  return {
    splitPct, splitFactor, netLabel,
    annualGoalNet, expectedMidyearNet, projectedH1ActualNet, midyearGap, isBehind,
    remainingGoalNet, q3ShareOfRemaining, q4ShareOfRemaining, q3CarryoverShare,
    adjustedQ3TargetNet, originalQ3GoalNet, surplusNet,
    avgGciPerSaleNet, avgGciPerClosedSaleNet, avgGciPerPendingSaleNet,
    usingConfirmedSaleAvg, saleAverageLooksLow,
    salesClosed, salesPending, salesConditional, confirmedSalesCount, inFlightSalesCount,
    q3SalesNeeded, q3PipelineRequired, q3CurrentPipeline, q3PipelineGap, weeklyNewContacts,
    annualDealGoal, q3DealCountUnreasonable,
  };
}