/**
 * Shared Q-Strategy calculations.
 * Used by StrategyGoalsTab + any other component that needs the same math.
 */

export const AGENT_SPLIT = 0.70;

export interface StrategyInputs {
  /** Agent's quarterly closings goal (deals) */
  qClosingsGoal: number;
  /** Average sale price */
  avgSalePrice: number;
  /** Commission rate as decimal (e.g. 0.03 for 3%) — preferred */
  commissionRate: number | null;
  /** Avg gross commission per deal (fallback when rate is null) */
  avgCommissionGross: number | null;
  /** Previous-quarter actual closed deals */
  prevQActualClosings: number;
  /** Previous-quarter required/goal closings */
  prevQGoalClosings: number;
}

export interface StrategyResults {
  /** Deals shortfall from previous quarter */
  prevQGap: number;
  /** Original quarterly goal before carryover */
  qBaseGoal: number;
  /** Adjusted closings = base + gap */
  adjustedClosings: number;
  /** Gross GCI per deal */
  avgGciPerDeal: number;
  /** Net income per deal (after 70% split) */
  agentNetPerDeal: number;
  /** Total gross GCI target for the quarter */
  qGciGross: number;
  /** Total net income target for the quarter */
  qIncomeNet: number;
}

export function computeStrategy(inputs: StrategyInputs): StrategyResults {
  const { qClosingsGoal, avgSalePrice, commissionRate, avgCommissionGross, prevQActualClosings, prevQGoalClosings } = inputs;

  // 1) Q-1 gap
  const prevQGap = Math.max(0, prevQGoalClosings - prevQActualClosings);

  // 2) Adjusted closings
  const qBaseGoal = qClosingsGoal;
  const adjustedClosings = qBaseGoal + prevQGap;

  // 3) Avg GCI/deal
  let avgGciPerDeal: number;
  if (commissionRate !== null && commissionRate > 0 && avgSalePrice > 0) {
    avgGciPerDeal = avgSalePrice * commissionRate;
  } else {
    avgGciPerDeal = avgCommissionGross || 0;
  }

  // 4) Agent net/deal
  const agentNetPerDeal = avgGciPerDeal * AGENT_SPLIT;

  // 5 + 6) Totals
  const qGciGross = adjustedClosings * avgGciPerDeal;
  const qIncomeNet = adjustedClosings * agentNetPerDeal;

  return { prevQGap, qBaseGoal, adjustedClosings, avgGciPerDeal, agentNetPerDeal, qGciGross, qIncomeNet };
}

/** Validate commission rate — 0-5% unless admin override */
export function validateCommissionRate(rate: number): string | null {
  if (rate < 0) return 'Commission rate cannot be negative';
  if (rate > 0.05) return 'Commission rate cannot exceed 5% (0.05)';
  return null;
}

/** Validate avg sale price */
export function validateAvgSalePrice(price: number): string | null {
  if (price <= 0) return 'Average sale price must be greater than 0';
  return null;
}

/** Validate closings goal */
export function validateClosingsGoal(goal: number): string | null {
  if (goal < 0) return 'Closings goal cannot be negative';
  return null;
}
