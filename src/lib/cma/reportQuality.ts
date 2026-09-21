export type CmaCompLike = {
  address?: string | null;
  area?: string | null;
  beds?: number | string | null;
  baths?: number | string | null;
  list_price?: number | string | null;
  listPrice?: number | string | null;
  sold_price?: number | string | null;
  soldPrice?: number | string | null;
  days_on_market?: number | string | null;
  dom?: number | string | null;
  sale_date?: string | null;
  status?: string | null;
  comp_category?: string | null;
  is_weak?: boolean | null;
  weak_reason?: string | null;
  sqft?: number | string | null;
  sqFt?: number | string | null;
  sq_ft?: number | string | null;
  ag_sqft?: number | string | null;
  bg_sqft?: number | string | null;
  above_grade_sqft?: number | string | null;
  finished_basement_sqft?: number | string | null;
  notes?: string | null;
};

export type DuplicatePriceAnomaly = {
  hasAnomaly: boolean;
  price: number | null;
  count: number;
  soldCount: number;
};

export const toCleanNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value);
  return Number.isFinite(n) ? n : null;
};

export const toPositiveNumber = (value: unknown): number | null => {
  const n = toCleanNumber(value);
  return n != null && n > 0 ? Math.round(n) : null;
};

const titleWord = (word: string) => {
  const lower = word.toLowerCase();
  const upperWords = new Set(['on', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  if (upperWords.has(lower)) return lower.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const cleanScalarText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\bfi\s+eld\b/gi, 'field')
    .replace(/\bfi\s+nished\b/gi, 'finished')
    .replace(/\bfi\s+replace\b/gi, 'fireplace')
    .replace(/\s+—\s+—\s+/g, ' — ')
    .replace(/--+/g, '—')
    .replace(/\s+/g, ' ')
    .trim();

export const humanizeLabel = (value: unknown): string => {
  const text = cleanScalarText(value)
    .replace(/_/g, ' ')
    .replace(/\bmost probable\b/i, 'Most probable')
    .replace(/\bprice per sqft\b/i, 'Price per sq ft');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const cleanText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && cleanScalarText(v).trim() !== '')
      .map(([k, v]) => `${humanizeLabel(k)}: ${typeof v === 'object' ? cleanText(v) : cleanScalarText(v)}`);
    return entries.join('; ');
  }
  return cleanScalarText(value);
};

export const normalizeAddress = (value: unknown): string => {
  const raw = cleanText(value).replace(/\.+$/g, '');
  if (!raw) return 'Address not reported';
  const beforeComma = raw.split(',')[0] || raw;
  return beforeComma
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const compact = part.replace(/\.$/, '');
      if (/^\d+[a-z]?$/i.test(compact)) return compact.toUpperCase();
      return titleWord(compact);
    })
    .join(' ')
    .replace(/\bAve\b/i, 'Ave')
    .replace(/\bDr\b/i, 'Dr')
    .replace(/\bBlvd\b/i, 'Blvd')
    .replace(/\bCrt\b/i, 'Crt');
};


export const money = (value: unknown, empty = 'Not reported'): string => {
  const n = toCleanNumber(value);
  if (n == null || !Number.isFinite(n) || n <= 0) return empty;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export const compactMoney = (value: unknown, empty = 'Not reported'): string => {
  const n = toCleanNumber(value);
  if (n == null || !Number.isFinite(n) || n <= 0) return empty;
  return `$${Math.round(n / 1000)}K`;
};

export const formatSignedDollars = (value: unknown): string => {
  const n = toCleanNumber(value);
  if (n == null) return 'Not stated';
  if (Math.round(n) === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
};

export const formatAdjustmentRange = (low: unknown, high: unknown): string => {
  const l = toCleanNumber(low);
  const h = toCleanNumber(high);
  if (l == null && h == null) return 'Not stated';
  if (l == null) return formatSignedDollars(h);
  if (h == null) return formatSignedDollars(l);
  if (Math.round(l) === 0 && Math.round(h) === 0) return 'No separate dollar adjustment';
  if (Math.round(l) === Math.round(h)) return formatSignedDollars(l);
  return `${formatSignedDollars(l)} to ${formatSignedDollars(h)}`;
};

export const shouldShowAdjustment = (adjustment: { adjustment_low?: unknown; adjustment_high?: unknown; rationale?: unknown }) => {
  const l = toCleanNumber(adjustment.adjustment_low);
  const h = toCleanNumber(adjustment.adjustment_high);
  if (l == null && h == null) return Boolean(cleanText(adjustment.rationale));
  return Math.round(l || 0) !== 0 || Math.round(h || 0) !== 0;
};

export const sqftLabel = (value: unknown): string => {
  const n = toPositiveNumber(value);
  return n ? `${n.toLocaleString('en-US')} sq ft` : 'Sq ft not reported';
};

export const compSqftLabel = (comp: CmaCompLike): string => {
  const ag = toPositiveNumber(comp.ag_sqft ?? comp.above_grade_sqft);
  const bg = toPositiveNumber(comp.bg_sqft ?? comp.finished_basement_sqft);
  const total = toPositiveNumber(comp.sqft ?? comp.sqFt ?? comp.sq_ft);
  if (ag && bg) return `${ag.toLocaleString('en-US')} AG + ${bg.toLocaleString('en-US')} BG sq ft`;
  if (ag) return `${ag.toLocaleString('en-US')} above-grade sq ft`;
  if (total) return `${total.toLocaleString('en-US')} sq ft reported`;
  return 'Sq ft not reported';
};

export const compPrice = (comp: CmaCompLike): number | null =>
  toPositiveNumber(comp.sold_price ?? comp.soldPrice) ?? toPositiveNumber(comp.list_price ?? comp.listPrice);

export const compStatus = (comp: CmaCompLike): string => {
  const raw = cleanText(comp.comp_category ?? comp.status).toLowerCase();
  if (raw.includes('pending')) return 'Pending';
  if (raw.includes('active')) return 'Active';
  if (raw.includes('expired') || raw.includes('withdrawn') || raw.includes('terminated')) return 'Expired';
  if (raw.includes('sold') || raw.includes('closed') || toPositiveNumber(comp.sold_price ?? comp.soldPrice)) return 'Sold';
  return 'Comparable';
};

export const detectDuplicateSoldPriceAnomaly = (comps: CmaCompLike[]): DuplicatePriceAnomaly => {
  const soldPrices = comps
    .filter((c) => String(c.comp_category ?? c.status ?? '').toLowerCase().includes('sold') || toPositiveNumber(c.sold_price ?? c.soldPrice))
    .map((c) => toPositiveNumber(c.sold_price ?? c.soldPrice))
    .filter((n): n is number => n != null);
  const counts = new Map<number, number>();
  soldPrices.forEach((price) => counts.set(price, (counts.get(price) || 0) + 1));
  let topPrice: number | null = null;
  let topCount = 0;
  counts.forEach((count, price) => {
    if (count > topCount) {
      topCount = count;
      topPrice = price;
    }
  });
  return {
    hasAnomaly: soldPrices.length >= 3 && topCount > soldPrices.length / 2,
    price: topPrice,
    count: topCount,
    soldCount: soldPrices.length,
  };
};

export const anomalyMessage = (anomaly: DuplicatePriceAnomaly): string =>
  anomaly.hasAnomaly
    ? `${anomaly.count} of ${anomaly.soldCount} sold comparables share the same sold price (${money(anomaly.price)}). Confirm those prices before approval or export.`
    : '';
