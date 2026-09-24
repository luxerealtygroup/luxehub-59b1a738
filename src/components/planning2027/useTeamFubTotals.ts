import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadDeals } from '@/lib/firmDeals';
import { inferDealCategory, getDealWeight } from '@/lib/utils/dealWeight';

export interface TeamFubTotals {
  loading: boolean;
  error: string | null;
  units: number;
  /** Closed leases (shared app-wide lease rule). */
  leases: number;
  /** Weighted closed units: sale 1, lease 1/3, lease with GCI >= threshold 1. */
  weightedUnits: number;
  /** Weighted units / GCI from personal transactions (no Luxe commission) — excluded from per-deal averages. */
  personalUnits: number;
  personalGci: number;
  /** Leases counted as a full unit (GCI at/above the threshold). */
  fullLeases: { name: string; gci: number }[];
  /** FUB contacts created this year (null until loaded). */
  newContacts: number | null;
  volume: number;
  /** Full team GCI — FUB `commissionValue` (gross commission on the deal), counted once per deal. */
  gci: number;
  /** Closings per month (1–12) in the year. */
  byMonth: number[];
  asOf: string;
}

const closeDate = (d: any): string => (d.closedDate || d.closeDate || d.projectedCloseDate || '').slice(0, 10);

/** Team-wide 2026 closings straight from Follow Up Boss (each deal once, not summed per agent). */
export function useTeamFubTotals(year = 2026): TeamFubTotals {
  const [t, setT] = useState<TeamFubTotals>({ loading: true, error: null, units: 0, leases: 0, weightedUnits: 0, personalUnits: 0, personalGci: 0, fullLeases: [], newContacts: null, volume: 0, gci: 0, byMonth: Array(12).fill(0), asOf: '' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded;
      try { loaded = await loadDeals(); } catch (e: any) {
        if (!cancelled) setT(s => ({ ...s, loading: false, error: e?.message ?? 'Could not load Follow Up Boss deals' }));
        return;
      }
      if (cancelled) return;
      const deals: any[] = loaded.deals; const meta = loaded.meta; const flags = loaded.flags;
      const today = new Date().toISOString().slice(0, 10);
      const out = { leases: 0, units: 0, weightedUnits: 0, personalUnits: 0, personalGci: 0, fullLeases: [] as { name: string; gci: number }[], volume: 0, gci: 0, byMonth: Array(12).fill(0) as number[] };
      for (const d of deals) {
        if (String(d.stageName ?? '').toLowerCase() !== 'closed') continue;
        const dt = closeDate(d);
        if (!dt.startsWith(String(year)) || dt > today) continue;
        out.units += 1;
        const w = getDealWeight(d, meta);
        out.weightedUnits += w;
        if (flags.get(Number(d.id))?.personal) { out.personalUnits += w; out.personalGci += Number(d.commissionValue || 0); }
        if (inferDealCategory(d, meta).category === 'lease') { out.leases += 1; if (w >= 1) out.fullLeases.push({ name: d.name, gci: Number(d.commissionValue || 0) }); }
        out.volume += Number(d.price || 0);
        out.gci += Number(d.commissionValue || 0);
        out.byMonth[Number(dt.slice(5, 7)) - 1] += 1;
      }
      setT(s => ({ ...s, loading: false, error: null, ...out, volume: Math.round(out.volume), gci: Math.round(out.gci), weightedUnits: Math.round(out.weightedUnits * 100) / 100, asOf: today }));
      // New FUB contacts created this year: walk newest-first until we pass Jan 1.
      let count = 0;
      for (let offset = 0; offset < 10000; offset += 100) {
        const r = await supabase.functions.invoke('follow-up-boss', { body: { action: 'get_people', params: { limit: 100, offset, sort: '-created' } } });
        const ppl: any[] = (r.data as any)?.data?.people ?? [];
        if (r.error || !ppl.length) break;
        const inYear = ppl.filter(p => String(p.created ?? '').startsWith(String(year))).length;
        count += inYear;
        if (inYear < ppl.length || ppl.length < 100) break;
      }
      if (!cancelled) setT(s => ({ ...s, newContacts: count }));
    })();
    return () => { cancelled = true; };
  }, [year]);
  return t;
}
