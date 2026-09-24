// One shared lead-source attribution rule for the whole app (read-only on Follow Up Boss).
//  1. Look at every client on the deal, skipping vendors / lawyers / lenders / other non-clients.
//  2. Any client with a Realtor.ca inquiry or event on their timeline (any year) → Realtor.ca.
//  3. Otherwise any client with a Realtor.ca tag → Realtor.ca.
//  4. Otherwise the first client's source field.
//  5. "Realtor" (agent/realtor referrals) is its own group, never Realtor.ca.
//  6. Vendors are never leads.   7. Leads = contacts created in the year, same grouping. Leases separate.
import { FUB_BASE_URL } from './fub.ts';

export const RULE_TEXT =
  'Each deal is credited to Realtor.ca if any client on it (vendors, lawyers and lenders skipped) has a Realtor.ca inquiry or event on their timeline, from any year, or a Realtor.ca tag. Otherwise it uses the first client\'s Follow Up Boss source. "Realtor" contacts (agent referrals) are their own group. Leads = contacts created in 2026, vendors excluded. Leases shown separately.';

export const GROUPS = ['Realtor.ca', 'Sphere / referrals', 'Agent / realtor referral', 'Past clients', 'Open houses', 'Social / paid / web', 'Other / import / unspecified'] as const;

const VENDOR_RE = /^(vendor|lawyer|mortgage|lender|inspector|stager|photographer|contractor|electrician|moving|property management)/i;
export const isVendor = (p: any) => VENDOR_RE.test(String(p?.source ?? '').trim()) || /^vendors?$/i.test(String(p?.stage ?? '')) ||
  (p?.tags ?? []).some((t: string) => /^vendor/i.test(t));
const rcTag = (p: any) => (p?.tags ?? []).some((t: string) => /realtor\.?\s?ca/i.test(t));
export function group(source: string, tags: string[] = []): string {
  const x = String(source ?? '').trim().toLowerCase();
  if (/realtor\.ca|realtorca/.test(x) || tags.some(t => /realtor\.?\s?ca/i.test(t))) return 'Realtor.ca';
  if (x === 'realtor' || /agent referral|broker referral|kw agent|^agent$/.test(x)) return 'Agent / realtor referral';
  if (/past client/.test(x)) return 'Past clients';
  if (/sphere|referr|friend|family/.test(x)) return 'Sphere / referrals';
  if (/open house/.test(x)) return 'Open houses';
  if (/facebook|instagram|ylopo|ppc|google|kijiji|website|^web$|online|direct connect|tiktok|youtube/.test(x)) return 'Social / paid / web';
  return 'Other / import / unspecified';
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function fubGet(h: Record<string, string>, path: string): Promise<any> {
  for (let a = 0; a < 7; a++) {
    const r = await fetch(`${FUB_BASE_URL}${path}`, { headers: h });
    if (r.status === 429) { await sleep((Number(r.headers.get('Retry-After')) || 2) * 1000 + a * 700); continue; }
    if (!r.ok) throw new Error(`FUB ${r.status}`);
    return r.json();
  }
  throw new Error('FUB rate limit');
}
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export interface AttributionMeta { category?: string | null; personal?: boolean; doubleEnd?: boolean }
export interface AttributionResult {
  as_of: string; rule: string;
  table: { source: string; leads: number; closed_sales: number; closed_leases: number; closed_gci: number; pending: number; pending_leases: number; pending_gci: number }[];
  deals: { id: number; name: string; stage: string; date: string; source: string; why: string; lease: boolean; gci: number; users: string[] }[];
  vendors_excluded: number;
}

export async function attribute(h: Record<string, string>, deals: any[], meta: Map<number, AttributionMeta>, year = 2026): Promise<AttributionResult> {
  const Y = String(year), today = new Date().toISOString().slice(0, 10);
  const dDate = (d: any) => String(d.closeDate || d.closedDate || d.projectedCloseDate || '').slice(0, 10);
  const isLease = (d: any) => { const m = meta.get(Number(d.id)); if (m?.category) return m.category === 'lease';
    return /lease|rental|\brent\b|tenant|leasing/i.test(`${d.pipelineName ?? ''} ${d.name ?? ''}`) || (Number(d.price || 0) > 0 && Number(d.price) < 10000); };
  const inScope = deals.filter(d => {
    const s = String(d.stageName).toLowerCase(), dt = dDate(d);
    if (s === 'closed') return dt.startsWith(Y) && dt <= today;
    if (s === 'pending') return !dt || dt.startsWith(Y);
    return false;
  });
  // Load every linked person (tags, source) and their timeline events.
  const ids = [...new Set(inScope.flatMap(d => (d.people ?? []).map((p: any) => Number(p.id))))];
  const people = new Map<number, any>();
  await pool(ids, 3, async id => {
    try {
      const p = await fubGet(h, `/people/${id}?fields=id,name,source,tags,stage,created`);
      const evs: any[] = [];
      for (let off = 0; off < 1000; off += 100) {
        const j = await fubGet(h, `/events?personId=${id}&limit=100&offset=${off}`);
        evs.push(...(j.events ?? [])); if ((j.events ?? []).length < 100) break;
      }
      p._rc = evs.some(e => /realtor\.?ca|realtor/i.test(`${e.source ?? ''} ${e.system ?? ''}`) && !/^ylopo/i.test(String(e.source ?? '')));
      people.set(id, p);
    } catch { people.set(id, { id, source: '', tags: [] }); }
  });

  const T = new Map<string, AttributionResult['table'][number]>();
  const row = (g: string) => { if (!T.has(g)) T.set(g, { source: g, leads: 0, closed_sales: 0, closed_leases: 0, closed_gci: 0, pending: 0, pending_leases: 0, pending_gci: 0 }); return T.get(g)!; };
  GROUPS.forEach(row);
  const out: AttributionResult['deals'] = [];
  for (const d of inScope) {
    const all = (d.people ?? []).map((x: any) => people.get(Number(x.id))).filter(Boolean);
    const clients = all.filter((p: any) => !isVendor(p));
    const use = clients.length ? clients : all;
    let g: string, why: string;
    if (use.some((p: any) => p._rc)) { g = 'Realtor.ca'; why = 'Realtor.ca inquiry on timeline'; }
    else if (use.some(rcTag)) { g = 'Realtor.ca'; why = 'Realtor.ca tag'; }
    else { g = group(use[0]?.source ?? '', use[0]?.tags ?? []); why = `source field "${use[0]?.source ?? '—'}"`; }
    const lease = isLease(d), gci = Number(d.commissionValue || 0), r = row(g);
    if (String(d.stageName).toLowerCase() === 'closed') { lease ? r.closed_leases++ : r.closed_sales++; r.closed_gci += gci; }
    else { lease ? r.pending_leases++ : r.pending++; r.pending_gci += gci; }
    out.push({ id: Number(d.id), name: d.name, stage: d.stageName, date: dDate(d), source: g, why, lease, gci, users: (d.users ?? []).map((u: any) => u.name) });
  }

  // Leads: contacts created in the year, vendors excluded.
  let vendors = 0;
  for (let off = 0; off < 20000; off += 100) {
    const j = await fubGet(h, `/people?limit=100&offset=${off}&sort=-created&fields=id,created,source,tags,stage`);
    const pp = j.people ?? []; const inY = pp.filter((p: any) => String(p.created).startsWith(Y));
    for (const p of inY) { if (isVendor(p)) { vendors++; continue; } row(group(p.source, p.tags ?? [])).leads++; }
    if (inY.length < pp.length || pp.length < 100) break;
  }
  const table = [...T.values()].map(r => ({ ...r, closed_gci: Math.round(r.closed_gci), pending_gci: Math.round(r.pending_gci) }))
    .sort((a, b) => (b.closed_gci + b.pending_gci) - (a.closed_gci + a.pending_gci));
  return { as_of: new Date().toISOString(), rule: RULE_TEXT, table, deals: out, vendors_excluded: vendors };
}
