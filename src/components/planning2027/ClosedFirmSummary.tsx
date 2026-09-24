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

/** "66 closed + 8 firm = 74" headline, with conditional shown separately and a year-end projection. */
export function ClosedFirmSummary({ fubUserId, year = 2026, showAgents = false, title }: { fubUserId?: number | null; year?: number; showAgents?: boolean; title?: string }) {
  const agentMode = fubUserId !== undefined;
  const { loading, error, data, asOf } = useFirmDeals(year, fubUserId ?? undefined, !agentMode || fubUserId != null);
  const raw = useFirmDealsRaw();
  if (agentMode && fubUserId == null) return <p className="text-xs text-muted-foreground">No Follow Up Boss user linked — closed and firm deals can't be shown.</p>;
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-gold" />Loading closed and firm deals…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{error ?? 'Could not load deals'}</p>;
  const { closed: c, firm: f, conditional: q, firmNextYear: nx } = data;
  const stamp = asOfLabel(asOf);
  const proj = { units: c.count + f.count + q.count * CONDITIONAL_SHARE, gci: c.gci + f.gci + q.gci * CONDITIONAL_SHARE, homes: c.homes + f.homes + q.homes * CONDITIONAL_SHARE };
  const agents = showAgents ? perAgent(raw.deals, year) : [];

  return (
    <div className="space-y-3">
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Box k={`${year} Closed + Firm`} v={`${n(c.count)} closed + ${n(f.count)} firm = ${n(c.count + f.count)}`}
          sub={`${n(c.homes + f.homes)} homes (${n(f.homes)} firm) + ${n(c.leases + f.leases)} leases (${n(f.leases)} firm)`}
          sub2={nx.count ? `+ ${n(nx.count)} firm, closing ${year + 1} (not counted)` : data.firmNoDate ? `${data.firmNoDate} firm with no closing date` : undefined} stamp={stamp} />
        <Box k="GCI · closed + firm" v={m(c.gci + f.gci)} sub={`${m(c.gci)} closed + ${m(f.gci)} firm`} stamp={stamp} />
        <Box k="Volume · closed + firm" v={m(c.volume + f.volume)} sub={`${m(c.volume)} closed + ${m(f.volume)} firm`} stamp={stamp} />
        <Box k="Conditional (not counted)" v={`${n(q.count)} conditional · ${m(q.gci)} GCI`} sub={`${m(q.volume)} volume · closing in ${year}`} stamp={stamp} />
      </div>
      <div className="rounded-lg border border-dashed border-gold/60 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Projected year-end {year}</p>
        <p className="text-lg font-bold text-foreground">≈ {n(Math.round(proj.units))} deals · {m(proj.gci)} GCI</p>
        <p className="text-xs text-muted-foreground mt-1">
          {n(c.count)} closed + {n(f.count)} firm + {Math.round(CONDITIONAL_SHARE * 100)}% of {n(q.count)} conditional ({n(Math.round(q.count * CONDITIONAL_SHARE * 10) / 10)}) · GCI {m(c.gci)} + {m(f.gci)} + {Math.round(CONDITIONAL_SHARE * 100)}% × {m(q.gci)}.
          {' '}The {Math.round(CONDITIONAL_SHARE * 100)}% is an assumption — Follow Up Boss doesn't keep offers that fell through, so there's no history to measure it. Deals not yet written aren't included.
        </p>
      </div>
      {showAgents && agents.length > 0 && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Agent</th><th className="p-2 text-right">Closed</th><th className="p-2 text-right">Firm</th><th className="p-2 text-right">Closed + firm</th><th className="p-2 text-right">GCI (closed + firm)</th><th className="p-2 text-right">Conditional</th><th className="p-2 text-right">Firm, closing {year + 1}</th></tr>
            </thead>
            <tbody>{agents.map(a => (
              <tr key={a.id} className="border-t border-border">
                <td className="p-2">{a.name}</td>
                <td className="p-2 text-right">{n(a.s.closed.count)} <span className="text-muted-foreground text-xs">({n(a.s.closed.leases)} lease)</span></td>
                <td className="p-2 text-right">{n(a.s.firm.count)}</td>
                <td className="p-2 text-right font-semibold">{n(a.s.closed.count + a.s.firm.count)}</td>
                <td className="p-2 text-right">{m(a.s.closed.gci + a.s.firm.gci)}</td>
                <td className="p-2 text-right">{n(a.s.conditional.count)} · {m(a.s.conditional.gci)}</td>
                <td className="p-2 text-right">{a.s.firmNextYear.count ? n(a.s.firmNextYear.count) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="p-2 text-[11px] text-muted-foreground">Shared deals split evenly between the agents on them; Marie (support) left out. Firm = Follow Up Boss "Pending" stage; conditional = "Offer" stage. {stamp}</p>
        </div>
      )}
    </div>
  );
}
