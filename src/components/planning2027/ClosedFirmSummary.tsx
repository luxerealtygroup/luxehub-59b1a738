import { Loader2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { asOfLabel, CONDITIONAL_SHARE, perAgent, useFirmDeals, useFirmDealsRaw } from '@/lib/firmDeals';

const m = (v: number) => formatCurrency(Math.round(v));
const n = (v: number) => (Number.isInteger(v) ? formatNumber(v) : (Math.round(v * 10) / 10).toString());

function Box({ k, v, sub, sub2, stamp }: { k: string; v: string; sub?: string; sub2?: string; stamp?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-lg sm:text-xl font-bold text-foreground break-words">{v}</p>
      {sub && <p className="text-xs font-medium text-foreground/80">{sub}</p>}
      {sub2 && <p className="text-xs text-muted-foreground">{sub2}</p>}
      {stamp && <p className="text-[11px] text-muted-foreground mt-1">{stamp}</p>}
    </div>
  );
}

/** "66 closed + 9 pending = 75" headline, with conditional shown separately and a year-end projection. */
export function ClosedFirmSummary({ fubUserId, year = 2026, showAgents = false, title }: { fubUserId?: number | null; year?: number; showAgents?: boolean; title?: string }) {
  const agentMode = fubUserId !== undefined;
  const { loading, error, data, asOf } = useFirmDeals(year, fubUserId ?? undefined, !agentMode || fubUserId != null);
  const raw = useFirmDealsRaw();
  if (agentMode && fubUserId == null) return <p className="text-xs text-muted-foreground">No Follow Up Boss user linked — closed and pending deals can't be shown.</p>;
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-gold" />Loading closed and pending deals…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{error ?? 'Could not load deals'}</p>;
  const { closed: c, firm: f, conditional: q, firmNextYear: nx } = data;
  const stamp = asOfLabel(asOf);
  const proj = { units: c.units + f.units + q.units * CONDITIONAL_SHARE, gci: c.gci + f.gci + q.gci * CONDITIONAL_SHARE, homes: c.homes + f.homes + q.homes * CONDITIONAL_SHARE };
  const agents = showAgents ? perAgent(raw.deals, year, raw.meta) : [];

  return (
    <div className="space-y-3">
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Box k={`${year} Closed + Pending · weighted units`} v={`${n(c.units)} closed + ${n(f.units)} pending = ${n(c.units + f.units)}`}
          sub={`${n(c.count + f.count)} deals: ${n(c.homes + f.homes)} homes (${n(f.homes)} pending) + ${n(c.leases + f.leases)} leases (${n(f.leases)} pending${c.fullLeases + f.fullLeases ? `; ${n(c.fullLeases + f.fullLeases)} at $4K+ GCI = 1 unit` : ''})`}
          sub2={nx.count ? `+ ${n(nx.count)} pending, closing ${year + 1} (not counted)` : data.firmNoDate ? `${data.firmNoDate} pending with no closing date` : undefined} stamp={stamp} />
        <Box k="GCI · closed + pending" v={m(c.gci + f.gci)} sub={`${m(c.gci)} closed + ${m(f.gci)} pending`} stamp={stamp} />
        <Box k="Volume · closed + pending" v={m(c.volume + f.volume)} sub={`${m(c.volume)} closed + ${m(f.volume)} pending`} stamp={stamp} />
        <Box k="Conditional (not counted)" v={`${n(q.count)} conditional · ${m(q.gci)} GCI`} sub={`${n(q.units)} weighted units · ${m(q.volume)} volume · closing in ${year}`} stamp={stamp} />
      </div>
      <div className="rounded-lg border border-dashed border-gold/60 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Projected year-end {year}</p>
        <p className="text-lg font-bold text-foreground">≈ {n(Math.round(proj.units * 10) / 10)} weighted units · {m(proj.gci)} GCI</p>
        <p className="text-xs text-muted-foreground mt-1">
          {n(c.units)} closed + {n(f.units)} pending + {Math.round(CONDITIONAL_SHARE * 100)}% of {n(q.units)} conditional units ({n(Math.round(q.units * CONDITIONAL_SHARE * 10) / 10)}) · GCI {m(c.gci)} + {m(f.gci)} + {Math.round(CONDITIONAL_SHARE * 100)}% × {m(q.gci)}.
          {' '}The {Math.round(CONDITIONAL_SHARE * 100)}% is an assumption — Follow Up Boss doesn't keep offers that fell through, so there's no history to measure it. Deals not yet written aren't included.
        </p>
      </div>
      {showAgents && agents.length > 0 && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Agent</th><th className="p-2 text-right">Homes</th><th className="p-2 text-right">Leases</th><th className="p-2 text-right">Closed units</th><th className="p-2 text-right">Pending units</th><th className="p-2 text-right">Closed + pending units</th><th className="p-2 text-right">GCI (closed + pending)</th><th className="p-2 text-right">Conditional</th><th className="p-2 text-right">Pending, closing {year + 1}</th></tr>
            </thead>
            <tbody>{agents.map(a => (
              <tr key={a.id} className="border-t border-border">
                <td className="p-2">{a.name}</td>
                <td className="p-2 text-right">{n(a.s.closed.homes)}</td>
                <td className="p-2 text-right">{n(a.s.closed.leases)}</td>
                <td className="p-2 text-right">{n(a.s.closed.units)}</td>
                <td className="p-2 text-right">{n(a.s.firm.units)}</td>
                <td className="p-2 text-right font-semibold">{n(a.s.closed.units + a.s.firm.units)}</td>
                <td className="p-2 text-right">{m(a.s.closed.gci + a.s.firm.gci)}</td>
                <td className="p-2 text-right">{n(a.s.conditional.units)} · {m(a.s.conditional.gci)}</td>
                <td className="p-2 text-right">{a.s.firmNextYear.count ? n(a.s.firmNextYear.count) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="p-2 text-[11px] text-muted-foreground">Shared deals split evenly between the agents on them; Marie (support) left out. Units weighted: sale 1 · lease ⅓ · lease with $4K+ GCI 1. Homes/leases are closed deals. Pending = Follow Up Boss "Pending" stage (conditions waived); conditional = "Offer" stage. {stamp}</p>
        </div>
      )}
    </div>
  );
}
