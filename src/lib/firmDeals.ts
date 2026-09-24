import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inferDealCategory, getDealWeight, DealMetadataMap } from '@/lib/utils/dealWeight';

/**
 * Closed + Firm counting for the 2026 numbers, straight from Follow Up Boss.
 *  - Closed: stage "Closed", closing date in the year and not in the future.
 *  - Firm: stage "Pending" (conditions waived, not yet closed). Year = expected closing date.
 *  - Conditional: stage "Offer" (or any stage named conditional). Shown, never counted.
 *  - Lease / weighting: the shared app-wide rule (deal_metadata marks, lease keywords, then rent-sized price);
 *    sale = 1 unit, lease = 1/3 unit, lease with GCI >= threshold = 1 unit. GCI always in full.
 * Shared deals split evenly between producing agents; support staff are left out.
 */
export const SUPPORT_NAMES = /^marie zinger$/i;
/** Share of conditional deals assumed to firm up for the year-end projection. */
export const CONDITIONAL_SHARE = 0.75;

export type DealKind = 'closed' | 'firm' | 'conditional' | null;
export const dealKind = (d: any): DealKind => {
  const s = String(d.stageName ?? '').toLowerCase();
  if (s === 'closed') return 'closed';
  if (s === 'pending' || s.includes('firm')) return 'firm';
  if (s === 'offer' || s.includes('conditional')) return 'conditional';
  return null;
};
export const dealDate = (d: any): string => String(d.closedDate || d.closeDate || d.projectedCloseDate || '').slice(0, 10);

export interface Bucket { count: number; units: number; homes: number; leases: number; fullLeases: number; volume: number; gci: number }
const empty = (): Bucket => ({ count: 0, units: 0, homes: 0, leases: 0, fullLeases: 0, volume: 0, gci: 0 });
export interface FirmSummary {
  closed: Bucket; firm: Bucket; conditional: Bucket;
  /** Firm deals whose expected closing is after this year (counted toward next year). */
  firmNextYear: Bucket;
  /** Firm deals with no expected closing date (counted this year, flagged). */
  firmNoDate: number;
  deals: { id: number; name: string; kind: DealKind; date: string; price: number; gci: number; lease: boolean; weight: number; share: number; nextYear: boolean }[];
}

export type DealFlags = Map<number, { personal: boolean; doubleEnd: boolean }>;
type Loaded = { at: Date; deals: any[]; meta: DealMetadataMap; flags: DealFlags };
let cache: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;
export async function loadDeals(): Promise<Loaded> {
  if (cache && Date.now() - cache.at.getTime() < 60_000) return cache;
  inflight ??= (async () => {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', { body: { action: 'get_deals', params: { limit: 100, paginate: true } } });
    if (error || !(data as any)?.success) throw new Error(error?.message ?? 'Could not load Follow Up Boss deals');
    const { data: md } = await supabase.from('deal_metadata').select('fub_deal_id, deal_category, weight_override, personal_transaction, double_end');
    const meta: DealMetadataMap = new Map(); const flags: DealFlags = new Map();
    for (const r of (md as any[]) ?? []) { if (r.deal_category || r.weight_override != null) meta.set(Number(r.fub_deal_id), { deal_category: r.deal_category, weight_override: r.weight_override });
      if (r.personal_transaction || r.double_end) flags.set(Number(r.fub_deal_id), { personal: !!r.personal_transaction, doubleEnd: !!r.double_end }); }
    cache = { at: new Date(), deals: (data as any)?.data?.deals ?? [], meta, flags };
    return cache;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function summarize(deals: any[], year: number, fubUserId?: number | null, meta?: DealMetadataMap): FirmSummary {
  const y = String(year), today = new Date().toISOString().slice(0, 10);
  const out: FirmSummary = { closed: empty(), firm: empty(), conditional: empty(), firmNextYear: empty(), firmNoDate: 0, deals: [] };
  for (const d of deals) {
    const kind = dealKind(d); if (!kind) continue;
    const producers = (d.users ?? []).filter((u: any) => !SUPPORT_NAMES.test(String(u.name ?? '')));
    let share = 1;
    if (fubUserId != null) {
      if (!producers.some((u: any) => Number(u.id) === Number(fubUserId))) continue;
      share = 1 / producers.length;
    }
    const date = dealDate(d), price = Number(d.price || 0), gci = Number(d.commissionValue || 0);
    const lease = inferDealCategory(d, meta).category === 'lease', weight = getDealWeight(d, meta);
    let target: Bucket; let nextYear = false;
    if (kind === 'closed') { if (!date.startsWith(y) || date > today) continue; target = out.closed; }
    else if (kind === 'firm') {
      if (!date) { out.firmNoDate++; target = out.firm; }
      else if (date.slice(0, 4) > y) { target = out.firmNextYear; nextYear = true; }
      else if (date.slice(0, 4) < y) continue;
      else target = out.firm;
    } else {
      if (date && date.slice(0, 4) !== y) continue;
      target = out.conditional;
    }
    target.count += share; target.units += weight * share; target.volume += price * share; target.gci += gci * share;
    if (lease) { target.leases += share; if (weight >= 1) target.fullLeases += share; } else target.homes += share;
    out.deals.push({ id: Number(d.id), name: d.name, kind, date, price, gci, lease, weight, share, nextYear });
  }
  return out;
}

export function useFirmDeals(year = 2026, fubUserId?: number | null, enabled = true) {
  const [s, setS] = useState<{ loading: boolean; error: string | null; data: FirmSummary | null; asOf: Date | null }>({ loading: true, error: null, data: null, asOf: null });
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    loadDeals().then(c => { if (!off) setS({ loading: false, error: null, data: summarize(c.deals, year, fubUserId, c.meta), asOf: c.at }); })
      .catch(e => { if (!off) setS({ loading: false, error: e.message, data: null, asOf: null }); });
    return () => { off = true; };
  }, [year, fubUserId, enabled]);
  return s;
}

/** Per producing agent (FUB user) breakdown for the team view. */
export function perAgent(deals: any[], year: number, meta?: DealMetadataMap) {
  const users = new Map<number, string>();
  for (const d of deals) for (const u of d.users ?? []) if (!SUPPORT_NAMES.test(String(u.name ?? ''))) users.set(Number(u.id), u.name);
  return [...users].map(([id, name]) => ({ id, name, s: summarize(deals, year, id, meta) }))
    .filter(a => a.s.closed.count + a.s.firm.count + a.s.conditional.count + a.s.firmNextYear.count > 0)
    .sort((a, b) => (b.s.closed.gci + b.s.firm.gci) - (a.s.closed.gci + a.s.firm.gci));
}
export function useFirmDealsRaw() {
  const [s, setS] = useState<{ deals: any[]; asOf: Date | null; meta?: DealMetadataMap }>({ deals: [], asOf: null });
  useEffect(() => { loadDeals().then(c => setS({ deals: c.deals, asOf: c.at, meta: c.meta })).catch(() => {}); }, []);
  return s;
}

export const asOfLabel = (d: Date | null) => d
  ? `As of ${d.toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · live from Follow Up Boss`
  : '';

/** Drop the cached deals so the next read picks up new deal flags. */
export function clearDealsCache() { cache = null; }
