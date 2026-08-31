import type { FUBDeal } from '@/lib/api/followUpBoss';
import type { PropertyRole, TransactionSide } from '@/hooks/usePortalProperties';

const STREET_WORDS = [
  'st', 'street', 'rd', 'road', 'ave', 'avenue', 'dr', 'drive', 'blvd', 'boulevard',
  'cres', 'crescent', 'crt', 'court', 'ct', 'lane', 'ln', 'way', 'trail', 'tr',
  'pl', 'place', 'terrace', 'terr', 'circle', 'cir', 'hwy', 'highway', 'pkwy',
  'parkway', 'sideroad', 'line', 'concession', 'unit', 'apt', 'suite',
];

/**
 * FUB has no deal address field — agents type the address into `deal.name`.
 * Roughly 8% of deals are named after the person instead, so every prefill has
 * to be shown to the agent and confirmed before it can reach a client.
 */
export function looksLikeAddress(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return false;
  if (/^\d+[a-z]?\s+\S/.test(n)) return true; // "5 Elm PVE St."
  if (/\d/.test(n) && STREET_WORDS.some((w) => new RegExp(`\\b${w}\\b\\.?`).test(n))) return true;
  return false;
}

/** Sellers pipeline -> listing/sell, Buyers pipeline -> purchase/buy. */
export function deriveSideFromPipeline(pipelineName: string | null | undefined): {
  side: TransactionSide;
  role: PropertyRole;
  confident: boolean;
} {
  const p = (pipelineName ?? '').toLowerCase();
  if (p.includes('seller') || p.includes('listing') || p.includes('sell')) {
    return { side: 'sell', role: 'listing', confident: true };
  }
  if (p.includes('buyer') || p.includes('purchase') || p.includes('buy')) {
    return { side: 'buy', role: 'purchase', confident: true };
  }
  // Unknown pipeline: default to purchase but tell the agent to check.
  return { side: 'buy', role: 'purchase', confident: false };
}

/** Best-effort address prefill from a deal. Never uses person.addresses[]. */
export function dealAddressPrefill(deal: Pick<FUBDeal, 'name' | 'propertyStreet' | 'propertyCity'>): string {
  const street = (deal.propertyStreet ?? '').trim();
  if (street) {
    const city = (deal.propertyCity ?? '').trim();
    return city ? `${street}, ${city}` : street;
  }
  return looksLikeAddress(deal.name) ? (deal.name ?? '').trim() : '';
}

export const formatDealPrice = (price: number | null | undefined) =>
  typeof price === 'number' && price > 0
    ? `$${Math.round(price).toLocaleString('en-US')}`
    : '—';
