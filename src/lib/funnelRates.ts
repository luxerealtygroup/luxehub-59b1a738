/**
 * Honest funnel rates.
 *
 * A conversion rate is only shown when the two numbers behind it were actually
 * measured over the same weeks. Mixing a fully synced meter (dials, pulled from
 * the phone system) with a sparsely hand-logged one (appointments held) is what
 * produced an "Appt Held → Contract" rate of 123.6% — more contracts than
 * appointments, which is impossible.
 *
 * Every rate on the Business Planning page goes through computeFunnelRate, and
 * nothing downstream may consume a rate whose `ok` flag is false.
 */

import { normalize411Row, Normalized411Row } from '@/lib/utils/weekly411Fallback';

export type FunnelMetric = keyof Normalized411Row;

export interface Weekly411Raw {
  week_start_date?: string | null;
  user_id?: string | null;
  dials?: number | null;
  contacts_made?: number | null;
  appointments_set?: number | null;
  appointments_held?: number | null;
  pipeline_additions?: number | null;
  contracts_signed?: number | null;
  firm_deals?: number | null;
  doors_knocked?: number | null;
  database_size?: number | null;
  calls_actual?: number | null;
  appointments_actual?: number | null;
  listings_actual?: number | null;
  contracts_actual?: number | null;
}

export interface FunnelRate {
  /** True only when the rate passed every reliability check. */
  ok: boolean;
  /** Rate as a fraction (0.069). Null when the rate failed. */
  rate: number | null;
  /** Rate as a percentage rounded to one decimal (6.9). Null when the rate failed. */
  pct: number | null;
  numerator: number;
  denominator: number;
  /** Agent-weeks where BOTH inputs were recorded. */
  pairedWeeks: number;
  /** Agent-weeks in the window at all. */
  totalWeeks: number;
  /** Set when the rate failed — a one-line, plain explanation. */
  reason: string | null;
  /** True when a large share of either side came from the fallback field. */
  unverified: boolean;
  unverifiedReason: string | null;
}

/** Minimum agent-weeks where both inputs are present. */
export const MIN_PAIRED_WEEKS = 12;
/** Minimum denominator before a rate means anything. */
export const MIN_DENOMINATOR = 30;
/** Share of a side that may come from the fallback field before it is flagged. */
const MAX_FALLBACK_SHARE = 0.25;

const num = (v: number | null | undefined): number => v || 0;

/** How much of a metric on one row came from the goal-tracking fallback field. */
function fallbackPortion(row: Weekly411Raw, metric: FunnelMetric): number {
  switch (metric) {
    case 'dials':
      return num(row.dials) ? 0 : num(row.calls_actual);
    case 'appointments_held':
      return num(row.appointments_held) ? 0 : num(row.appointments_actual);
    case 'appointments_set':
      return num(row.appointments_set) ? 0 : num(row.appointments_actual);
    case 'contracts_signed':
      return num(row.contracts_signed) ? 0 : num(row.contracts_actual);
    default:
      return 0;
  }
}

const METRIC_LABEL: Record<string, string> = {
  dials: 'dials',
  contacts_made: 'conversations',
  appointments_set: 'appointments set',
  appointments_held: 'appointments held',
  pipeline_additions: 'pipeline additions',
  contracts_signed: 'contracts',
  firm_deals: 'firm deals',
};

const label = (m: FunnelMetric) => METRIC_LABEL[m] || String(m);

/**
 * Computes one funnel rate over the paired basis, applying the reliability checks.
 *
 * @param rows        weekly_411 rows already scoped to the team and period
 * @param numerator   metric on top of the rate
 * @param denominator metric on the bottom of the rate
 */
export function computeFunnelRate(
  rows: Weekly411Raw[],
  numerator: FunnelMetric,
  denominator: FunnelMetric,
): FunnelRate {
  const totalWeeks = rows.length;
  let numTotal = 0;
  let denTotal = 0;
  let numFallback = 0;
  let denFallback = 0;
  let pairedWeeks = 0;

  for (const row of rows) {
    const n = normalize411Row(row);
    const numValue = n[numerator];
    const denValue = n[denominator];
    // Paired basis: both sides must have been recorded that week, or the week
    // tells us nothing about how one converts into the other.
    if (denValue <= 0) continue;
    if (numValue <= 0 && denValue <= 0) continue;
    // A week with a denominator but no numerator is real information (no
    // conversion happened), so it counts. A week with a numerator and no
    // denominator is a logging failure and is dropped by the check above.
    pairedWeeks += 1;
    numTotal += numValue;
    denTotal += denValue;
    numFallback += fallbackPortion(row, numerator);
    denFallback += fallbackPortion(row, denominator);
  }

  const base: FunnelRate = {
    ok: false, rate: null, pct: null,
    numerator: numTotal, denominator: denTotal,
    pairedWeeks, totalWeeks, reason: null,
    unverified: false, unverifiedReason: null,
  };

  if (pairedWeeks < MIN_PAIRED_WEEKS) {
    return { ...base, reason: `${label(numerator)} and ${label(denominator)} both recorded in only ${pairedWeeks} of ${totalWeeks} agent-weeks` };
  }
  if (denTotal < MIN_DENOMINATOR) {
    return { ...base, reason: `only ${denTotal} ${label(denominator)} recorded — too few to measure a rate` };
  }

  const rate = numTotal / denTotal;
  if (rate > 1) {
    return { ...base, reason: `more ${label(numerator)} than ${label(denominator)} were logged, so ${label(denominator)} are being under-recorded` };
  }

  const numShare = numTotal > 0 ? numFallback / numTotal : 0;
  const denShare = denTotal > 0 ? denFallback / denTotal : 0;
  const unverified = numShare > MAX_FALLBACK_SHARE || denShare > MAX_FALLBACK_SHARE;
  const worst = numShare >= denShare ? numerator : denominator;

  return {
    ...base,
    ok: true,
    rate,
    pct: Math.round(rate * 1000) / 10,
    unverified,
    unverifiedReason: unverified
      ? `${Math.round(Math.max(numShare, denShare) * 100)}% of ${label(worst)} came from goal tracking rather than weekly logging`
      : null,
  };
}

/** Totals over a set of rows, for pace comparisons. */
export function totalMetric(rows: Weekly411Raw[], metric: FunnelMetric): number {
  return rows.reduce((sum, row) => sum + normalize411Row(row)[metric], 0);
}
