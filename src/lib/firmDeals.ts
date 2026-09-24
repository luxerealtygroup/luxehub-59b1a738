import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Closed + Firm counting for the 2026 numbers, straight from Follow Up Boss.
 *  - Closed: stage "Closed", closing date in the year and not in the future.
 *  - Firm: stage "Pending" (conditions waived, not yet closed). Year = expected closing date.
 *  - Conditional: stage "Offer" (or any stage named conditional). Shown, never counted.
 *  - Lease: price under $10,000 — listed separately, not a home sold.
 * Shared deals split evenly between producing agents; support staff are left out.
 */
export const SUPPORT_NAMES = /^marie zinger$/i;
/** Share of conditional deals assumed to firm up for the year-end projection. */
export const CONDITIONAL_SHARE = 0.75;
export const LEASE_MAX = 10000;

export type DealKind = 'closed' | 'firm' | 'conditional' | null;
export const dealKind = (d: any): DealKind => {
  const s = String(d.stageName ?? '').toLowerCase();
  if (s === 'closed') return 'closed';
  if (s === 'pending' || s.includes('firm')) return 'firm';
  if (s === 'offer' || s.includes('conditional')) return 'conditional';
  return null;
};
export const dealDate = (d: any): string => String(d.closedDate || d.closeDate || d.projectedCloseDate || '').slice(0, 10);

export interface Bucket { count: number; homes: number; leases: number; volume: number; gci: number }
const empty = (): Bucket => ({ count: 0, homes: 0, leases: 0, volume: 0, gci: 0 });
export interface FirmSummary {
  closed: Bucket; firm: Bucket; conditional: Bucket;
  /** Firm deals whose expected closing is after this year (counted toward next year). */
  firmNextYear: Bucket;
  /** Firm deals with no expected closing date (counted this year, flagged). */
  firmNoDate: number;
  deals: { name: string; kind: DealKind; date: string; price: number; gci: number; lease: boolean; share: number; nextYear: boolean }[];
}

let cache: { at: Date; deals: any[] } | null = null;
let inflight: Promise<{ at: Date; deals: any[] }> | null = null;
async function loadDeals() {
  if (cache && Date.now() - cache.at.getTime() < 60_000) return cache;
  inflight ??= (async () => {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', { body: { action: 'get_deals', params: { limit: 100, paginate: true } } });
    if (error || !(data as any)?.success) throw new Error(error?.message ?? 'Could not load Follow Up Boss deals');
    cache = { at: new Date(), deals: (data as any)?.data?.deals ?? [] };
    return cache;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function summarize(deals: any[], year: number, fubUserId?: number | null): FirmSummary {
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
    const date = dealDate(d), price = Number(d.price || 0), gci = Number(d.commissionValue || 0), lease = price < LEASE_MAX;
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
    target.count += share; target.volume += price * share; target.gci += gci * share;
    lease ? (target.leases += share) : (target.homes += share);
    out.deals.push({ name: d.name, kind, date, price, gci, lease, share, nextYear });
  }
  return out;
}

export function useFirmDeals(year = 2026, fubUserId?: number | null, enabled = true) {
  const [s, setS] = useState<{ loading: boolean; error: string | null; data: FirmSummary | null; asOf: Date | null }>({ loading: true, error: null, data: null, asOf: null });
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    loadDeals().then(c => { if (!off) setS({ loading: false, error: null, data: summarize(c.deals, year, fubUserId), asOf: c.at }); })
      .catch(e => { if (!off) setS({ loading: false, error: e.message, data: null, asOf: null }); });
    return () => { off = true; };
  }, [year, fubUserId, enabled]);
  return s;
}

/** Per producing agent (FUB user) breakdown for the team view. */
export function perAgent(deals: any[], year: number) {
  const users = new Map<number, string>();
  for (const d of deals) for (const u of d.users ?? []) if (!SUPPORT_NAMES.test(String(u.name ?? ''))) users.set(Number(u.id), u.name);
  return [...users].map(([id, name]) => ({ id, name, s: summarize(deals, year, id) }))
    .filter(a => a.s.closed.count + a.s.firm.count + a.s.conditional.count + a.s.firmNextYear.count > 0)
    .sort((a, b) => (b.s.closed.gci + b.s.firm.gci) - (a.s.closed.gci + a.s.firm.gci));
}
export function useFirmDealsRaw() {
  const [s, setS] = useState<{ deals: any[]; asOf: Date | null }>({ deals: [], asOf: null });
  useEffect(() => { loadDeals().then(c => setS({ deals: c.deals, asOf: c.at })).catch(() => {}); }, []);
  return s;
}

export const asOfLabel = (d: Date | null) => d
  ? `As of ${d.toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · live from Follow Up Boss`
  : '';
