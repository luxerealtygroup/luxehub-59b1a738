// Shared CMA output guardrails.
// Single implementation used by BOTH cma-analyze (structured JSON) and
// generate-cma (client-facing HTML) so the two can never drift apart.

const BANNED_BRANDING: Array<[RegExp, string]> = [
  [/\bCMA\s*Boss\b/gi, 'Luxe Realty Group'],
  [/\bRealty\s*Hub\b/gi, 'Luxe Realty Group'],
  [/\bLUXE\s*hub\b/gi, 'Luxe Realty Group'],
  [/\bCloud\s*CMA\b/gi, 'the MLS comparable data'],
];

export function cleanBrandingString(s: string): string {
  let out = s;
  for (const [re, replacement] of BANNED_BRANDING) out = out.replace(re, replacement);
  return out;
}

function walkStrings<T>(value: T, fn: (s: string) => string, dropEmptyArrayItems = false): T {
  const walk = (v: any): any => {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) {
      const mapped = v.map(walk);
      return dropEmptyArrayItems
        ? mapped.filter((x: any) => !(typeof x === 'string' && x.trim() === ''))
        : mapped;
    }
    if (v && typeof v === 'object') {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value);
}

export function stripBannedBranding<T>(value: T): T {
  return walkStrings(value, cleanBrandingString);
}

// Force every dollar figure in prose that is "about" the recommended price to be
// the single canonical recommended value, so the report can never disagree with itself.
export function normalizeRecommendedPriceString(s: string, recommended: number): string {
  const canonical = `$${Math.round(recommended).toLocaleString('en-US')}`;
  return s.replace(/\$\s?([\d,]{4,})(?:\.\d{2})?/g, (full, digits: string) => {
    const n = Number(String(digits).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return full;
    const drift = Math.abs(n - recommended) / recommended;
    return drift > 0 && drift <= 0.05 ? canonical : full;
  });
}

export function normalizeRecommendedPrice<T>(value: T, recommended: number | null): T {
  if (!recommended || !Number.isFinite(recommended)) return value;
  return walkStrings(value, (s) => normalizeRecommendedPriceString(s, recommended));
}

// Remove "pending" commentary when the comp set contains no pending comps.
export function stripUnsupportedPendingClaimsString(s: string): string {
  return s
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\bpending\b/i.test(sentence))
    .join(' ')
    .trim();
}

export function stripUnsupportedPendingClaims<T>(value: T, pendingCount: number): T {
  if (pendingCount > 0) return value;
  return walkStrings(value, stripUnsupportedPendingClaimsString, true);
}

// ---- HTML variants (generate-cma) ----------------------------------------
// Applied to rendered HTML: branding + recommended-price normalization are safe
// string-level operations. Pending-claim scrubbing is applied to text nodes only
// so markup is never destroyed.
export function applyHtmlGuardrails(
  html: string,
  opts: { recommended?: number | null; pendingCount?: number } = {},
): string {
  let out = cleanBrandingString(html);
  if (opts.recommended && Number.isFinite(opts.recommended)) {
    out = normalizeRecommendedPriceString(out, Number(opts.recommended));
  }
  if ((opts.pendingCount ?? 0) === 0) {
    // Scrub pending sentences inside text nodes between tags only.
    out = out.replace(/>([^<]+)</g, (full, text: string) => {
      if (!/\bpending\b/i.test(text)) return full;
      const scrubbed = stripUnsupportedPendingClaimsString(text);
      return `>${scrubbed}<`;
    });
  }
  return out;
}
