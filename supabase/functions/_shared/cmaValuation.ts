export function cleanNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function positiveNumber(value: unknown): number | null {
  const n = cleanNumber(value);
  return n != null && n > 0 ? Math.round(n) : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const roundTo = (value: number, nearest = 1000) => Math.round(value / nearest) * nearest;

function adjustmentMidpoint(adjustments: any[]): number {
  if (!Array.isArray(adjustments)) return 0;
  return adjustments.reduce((sum, item) => {
    const low = cleanNumber(item?.adjustment_low);
    const high = cleanNumber(item?.adjustment_high);
    if (low == null && high == null) return sum;
    if (low == null) return sum + (high || 0);
    if (high == null) return sum + low;
    return sum + (low + high) / 2;
  }, 0);
}

function normalizeScenarioRationale(existing: any, fallback: string): string {
  return typeof existing?.rationale === 'string' && existing.rationale.trim() ? existing.rationale.trim() : fallback;
}

export function computeAdjustedPricing(comps: any[], analysis: any, subjectProperty: any = {}) {
  const soldPrices = (Array.isArray(comps) ? comps : [])
    .filter((c) => String(c?.comp_category || c?.status || '').toLowerCase().includes('sold') || positiveNumber(c?.sold_price ?? c?.soldPrice))
    .map((c) => positiveNumber(c?.sold_price ?? c?.soldPrice))
    .filter((n): n is number => n != null);

  const targetOverride = positiveNumber(subjectProperty?.targetPrice ?? subjectProperty?.target_list_price);
  const existingRecommended = positiveNumber(analysis?.pricing_band_recommended);
  if (!soldPrices.length && !targetOverride && !existingRecommended) {
    return { low: null, recommended: null, high: null, override: false, basis: [] as number[] };
  }

  const netAdjustment = adjustmentMidpoint(Array.isArray(analysis?.feature_adjustments) ? analysis.feature_adjustments : []);
  const adjusted = soldPrices.map((price) => roundTo(price + netAdjustment));
  const basis = adjusted.length ? adjusted : soldPrices;

  let low = percentile(basis, 0.25);
  let recommended = percentile(basis, 0.5);
  let high = percentile(basis, 0.75);

  if (!basis.length) {
    recommended = targetOverride ?? existingRecommended;
    low = recommended ? recommended * 0.96 : null;
    high = recommended ? recommended * 1.04 : null;
  }

  const override = !!targetOverride;
  if (targetOverride) recommended = targetOverride;
  else if (!recommended && existingRecommended) recommended = existingRecommended;

  if (recommended != null) {
    if (low == null || low >= recommended) low = recommended * 0.96;
    if (high == null || high <= recommended) high = recommended * 1.04;
  }

  return {
    low: low != null ? roundTo(low) : null,
    recommended: recommended != null ? roundTo(recommended) : null,
    high: high != null ? roundTo(high) : null,
    override,
    basis,
  };
}

export function normalizePricingFields(analysis: any, comps: any[], subjectProperty: any = {}) {
  const pricing = computeAdjustedPricing(comps, analysis, subjectProperty);
  const out = { ...(analysis || {}) };
  if (pricing.recommended) {
    out.pricing_band_low = pricing.low;
    out.pricing_band_recommended = pricing.recommended;
    out.pricing_band_high = pricing.high;
    out.recommended_price = pricing.recommended;
    out.pricing_basis = {
      method: pricing.override ? 'agent_target_override' : 'adjusted_sold_comp_percentiles',
      adjusted_sold_comp_values: pricing.basis,
    };
    out.valuation_scenarios = {
      conservative: {
        price: pricing.low,
        rationale: normalizeScenarioRationale(out.valuation_scenarios?.conservative, 'Conservative case based on the lower quartile of adjusted sold comparable support.'),
      },
      most_probable: {
        price: pricing.recommended,
        rationale: normalizeScenarioRationale(out.valuation_scenarios?.most_probable, pricing.override ? 'Most probable reflects the agent-reviewed target price override.' : 'Most probable reflects the median of adjusted sold comparable support.'),
      },
      optimistic: {
        price: pricing.high,
        rationale: normalizeScenarioRationale(out.valuation_scenarios?.optimistic, 'Optimistic case based on the upper quartile of adjusted sold comparable support.'),
      },
    };
  }
  return out;
}

export function computeAboveGradeCrossCheck(comps: any[], subjectProperty: any, recommended?: number | null) {
  const subjectAbove = positiveNumber(subjectProperty?.aboveGradeSqFt ?? subjectProperty?.above_grade_sqft ?? subjectProperty?.ag_sqft ?? subjectProperty?.sqft);
  const soldComps = (Array.isArray(comps) ? comps : []).filter(
    (c) => String(c?.comp_category || c?.status || '').toLowerCase().includes('sold') || positiveNumber(c?.sold_price ?? c?.soldPrice),
  );
  const rows = soldComps
    .map((c) => {
      const ag = positiveNumber(c?.ag_sqft ?? c?.above_grade_sqft ?? c?.sqft ?? c?.sqFt ?? c?.sq_ft);
      const price = positiveNumber(c?.sold_price ?? c?.soldPrice);
      if (!ag || !price) return null;
      return {
        address: c?.address ?? null,
        above_grade_sqft: ag,
        sold_price: price,
        price_per_sqft: Math.round((price / ag) * 100) / 100,
        sale_date: c?.sale_date ?? null,
        sqft_delta_vs_subject: subjectAbove ? ag - subjectAbove : null,
      };
    })
    .filter(Boolean) as any[];

  const ranked = subjectAbove
    ? [...rows].sort((a, b) => Math.abs(a.sqft_delta_vs_subject) - Math.abs(b.sqft_delta_vs_subject))
    : rows;
  const used = ranked.slice(0, 3);
  const rates = used.map((r) => r.price_per_sqft);
  const impliedLow = subjectAbove && rates.length ? roundTo(subjectAbove * Math.min(...rates)) : null;
  const impliedHigh = subjectAbove && rates.length ? roundTo(subjectAbove * Math.max(...rates)) : null;
  let verdict: 'confirms' | 'challenges' | 'inconclusive' = 'inconclusive';
  if (subjectAbove && rates.length >= 2 && recommended) {
    verdict = recommended >= (impliedLow || 0) * 0.98 && recommended <= (impliedHigh || 0) * 1.02 ? 'confirms' : 'challenges';
  }

  return {
    subject_above_grade_sqft: subjectAbove,
    subject_total_finished_sqft: subjectAbove,
    basis: 'above_grade_area_only',
    comps_used: used,
    omitted_count: soldComps.length - rows.length,
    implied_low: impliedLow,
    implied_high: impliedHigh,
    verdict,
    commentary: subjectAbove && rates.length >= 2
      ? `Above-grade $/sq ft from ${used.length} sold comps implies ${impliedLow ? `$${impliedLow.toLocaleString('en-US')}` : 'an unavailable low'} to ${impliedHigh ? `$${impliedHigh.toLocaleString('en-US')}` : 'an unavailable high'}. ${soldComps.length - rows.length > 0 ? `${soldComps.length - rows.length} sold comp${soldComps.length - rows.length === 1 ? '' : 's'} omitted for missing usable area.` : 'All sold comps with usable area were included.'}`
      : 'Not enough reliable above-grade square-footage data was available for a useful cross-check.',
  };
}
