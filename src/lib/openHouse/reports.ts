/**
 * Open house reports.
 *
 * Two audiences, two pages:
 *  - the seller recap (aggregate only — no visitor is ever named)
 *  - the buyer's "Homes like this one" page, one per guest
 */

import { Timeline } from '@/lib/openHouse/options';

/** A listing shown alongside a report — picked from active listings or typed in. */
export interface ReportListing {
  address: string;
  price: number | null;
  photo_url: string | null;
  link: string | null;
}

export interface SellerReport {
  address: string;
  city: string | null;
  list_price: number | null;
  cover_photo_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  hosting_agent_name: string | null;
  hosting_agent_email: string | null;
  doors_knocked: number | null;
  notes: string | null;
  visitors: number;
  with_agent: number;
  home_to_sell: number;
  spoken_to_lender: number;
  hot: number;
  warm: number;
  cold: number;
  price_feedback: Record<string, number>;
  condition_feedback: Record<string, number>;
}

export interface BuyerReport {
  first_name: string;
  intent: string | null;
  timeline: Timeline | string | null;
  featured_listings: ReportListing[];
  address: string;
  city: string | null;
  list_price: number | null;
  cover_photo_url: string | null;
  hosting_agent_name: string | null;
  hosting_agent_email: string | null;
}

// ---------------------------------------------------------------------------
// The search-site link template (set once by an admin, never hardcoded)
// ---------------------------------------------------------------------------

export const SEARCH_TEMPLATE_KEY = 'open_house_search_url_template';

export const SEARCH_TEMPLATE_PLACEHOLDERS = ['{minPrice}', '{maxPrice}', '{beds}', '{city}'] as const;

export function isHttpsUrlTemplate(value: string): boolean {
  const v = (value || '').trim();
  if (!v.toLowerCase().startsWith('https://')) return false;
  try {
    // Placeholders are not valid URL characters everywhere — swap them out to test.
    new URL(v.replace(/\{[a-zA-Z]+\}/g, '1'));
    return true;
  } catch {
    return false;
  }
}

/** A sensible band around what the visitor came to see. */
export function priceBand(listPrice: number | null): { min: number; max: number } | null {
  if (!listPrice || !Number.isFinite(listPrice) || listPrice <= 0) return null;
  return { min: Math.round(listPrice * 0.85), max: Math.round(listPrice * 1.15) };
}

export function fillSearchTemplate(
  template: string,
  values: { minPrice: number | null; maxPrice: number | null; beds: number | null; city: string | null },
): string {
  return template
    .replace(/\{minPrice\}/g, values.minPrice != null ? String(values.minPrice) : '')
    .replace(/\{maxPrice\}/g, values.maxPrice != null ? String(values.maxPrice) : '')
    .replace(/\{beds\}/g, values.beds != null ? String(values.beds) : '')
    .replace(/\{city\}/g, encodeURIComponent(values.city || ''));
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export function sellerReportUrl(slug: string): string {
  return `${window.location.origin}/oh/report/${slug}`;
}

export function buyerReportUrl(token: string): string {
  return `${window.location.origin}/oh/homes/${token}`;
}

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Math.round(Number(n)).toLocaleString('en-US')}`;
}

export function asListings(value: unknown): ReportListing[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === 'object')
    .map((v) => {
      const r = v as Record<string, unknown>;
      return {
        address: String(r.address || '').trim(),
        price: typeof r.price === 'number' ? r.price : r.price ? Number(r.price) || null : null,
        photo_url: r.photo_url ? String(r.photo_url) : null,
        link: r.link ? String(r.link) : null,
      };
    })
    .filter((l) => l.address.length > 0);
}
