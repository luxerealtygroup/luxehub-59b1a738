import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Lock, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PLAN_YEAR } from '@/lib/planning2027';
import type { TeamFubTotals } from './useTeamFubTotals';

export interface CompanyPlanRow {
  id: string; operating_costs: number; debt_total: number; profit_tiers: number[];
  luxe_revenue_per_deal: number; gci_per_deal: number; deals_per_agent: number;
  quarterly_checkpoints: { q: number; low: number | null; high: number | null }[];
}

/** Loads the plan; RLS only returns it to the named owner(s), so null means "not visible to you". */
export function useCompanyPlan() {
  const [row, setRow] = useState<CompanyPlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const { data } = await supabase.from('company_plans' as any).select('*').eq('plan_year', PLAN_YEAR).maybeSingle();
    setRow((data as any) ?? null); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return { row, loading, reload: load, setRow };
}

const m = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : formatCurrency(Math.round(v)));
const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : formatNumber(Math.round(v)));

export function calcTiers(p: CompanyPlanRow) {
  return p.profit_tiers.map(profit => {
    const tx = p.luxe_revenue_per_deal > 0 ? Math.ceil((Number(p.operating_costs) + Number(p.debt_total) + profit) / p.luxe_revenue_per_deal) : null;
    return { profit, tx, gci: tx != null ? tx * p.gci_per_deal : null, monthly: tx != null ? Math.round((tx / 12) * 10) / 10 : null };
  });
}

/** Annualised pace from year-to-date closings. */
export function annualPace(t: TeamFubTotals) {
  if (!t.asOf || !t.units) return null;
  const d = new Date(`${t.asOf}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = (d.getTime() - start.getTime()) / 86400000 + 1;
  return Math.round((t.units / days) * 365);
}

export function CompanyPlan({ plan, onSaved, fub, agentDealGoals }: {
  plan: CompanyPlanRow; onSaved: () => void; fub: TeamFubTotals; agentDealGoals: { submitted: number; deals: number; total: number };
}) {
  const [p, setP] = useState<CompanyPlanRow>(plan);
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  useEffect(() => setP(plan), [plan]);
  const tiers = useMemo(() => calcTiers(p), [p]);
  const pace = annualPace(fub);
  const txLow = tiers[0]?.tx ?? null, txHigh = tiers[tiers.length - 1]?.tx ?? null;

  const num = (k: keyof CompanyPlanRow, label: string, prefix = '$') => (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={`cp_${k}`} className="text-xs">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input id={`cp_${k}`} type="number" inputMode="decimal" className={prefix ? 'pl-6' : ''} value={(p[k] as number) ?? ''}
          onChange={e => setP({ ...p, [k]: e.target.value === '' ? 0 : Number(e.target.value) })} />
      </div>
    </div>
  );

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('company_plans' as any).update({
      operating_costs: p.operating_costs, debt_total: p.debt_total, profit_tiers: p.profit_tiers,
      luxe_revenue_per_deal: p.luxe_revenue_per_deal, gci_per_deal: p.gci_per_deal, deals_per_agent: p.deals_per_agent,
      quarterly_checkpoints: p.quarterly_checkpoints,
    }).eq('id', p.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Company plan saved'); onSaved();
  };

  const gapLow = txLow != null ? txLow - agentDealGoals.deals : null;
  const gapHigh = txHigh != null ? txHigh - agentDealGoals.deals : null;

  const teamNumber = (
    <Card className={`border-gold/60 ${big ? 'fixed inset-0 z-50 m-0 rounded-none overflow-auto' : ''}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className={`font-display ${big ? 'text-4xl' : 'text-xl'}`}>The Team Number</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setBig(b => !b)} className="gap-2">
          {big ? <><Minimize2 className="h-4 w-4" />Exit</> : <><Maximize2 className="h-4 w-4" />Present</>}
        </Button>
      </CardHeader>
      <CardContent className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${big ? 'p-10 gap-8' : ''}`}>
        {[
          ['The plan needs', txLow != null ? `${n(txLow)}–${n(txHigh)}` : '—', 'transactions'],
          ['Agents have committed', n(agentDealGoals.deals), `deals · ${agentDealGoals.submitted} of ${agentDealGoals.total} plans in`],
          ['The gap', gapLow != null ? `${n(Math.max(0, gapLow))}–${n(Math.max(0, gapHigh ?? 0))}` : '—', 'transactions to find'],
        ].map(([k, v, sub], i) => (
          <div key={k} className={`rounded-xl border p-5 text-center ${i === 2 ? 'border-gold bg-gold/10' : 'border-border bg-card'}`}>
            <p className={`uppercase tracking-wider text-muted-foreground ${big ? 'text-xl' : 'text-xs'}`}>{k}</p>
            <p className={`font-bold text-foreground ${big ? 'text-8xl my-4' : 'text-4xl my-2'}`}>{v}</p>
            <p className={`text-muted-foreground ${big ? 'text-xl' : 'text-sm'}`}>{sub}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />Owner-only. Agents, staff and other admins can't see this page or its numbers.</p>
      {teamNumber}

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Transactions needed</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {tiers.map(t => {
              const gap = t.tx != null && pace != null ? t.tx - pace : null;
              const agents = gap != null && p.deals_per_agent > 0 ? Math.max(0, Math.ceil(gap / p.deals_per_agent)) : null;
              return (
                <div key={t.profit} className="rounded-lg border border-border bg-card p-4 space-y-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{m(t.profit)} profit</p>
                  <p className="text-3xl font-bold text-foreground">{n(t.tx)} <span className="text-base font-normal text-muted-foreground">transactions</span></p>
                  <p className="text-sm text-muted-foreground">Team GCI {m(t.gci)} · {t.monthly ?? '—'} / month</p>
                  <p className="text-sm text-muted-foreground">Gap vs current pace: <span className="font-semibold text-foreground">{gap == null ? '—' : n(gap)}</span></p>
                  <p className="text-sm text-muted-foreground">New agents needed ({p.deals_per_agent} deals each): <span className="font-semibold text-foreground">{agents == null ? '—' : n(agents)}</span></p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Current pace: {fub.loading ? 'loading…' : pace == null ? '—' : `${n(pace)} transactions/year`} — {n(fub.units)} closed in {PLAN_YEAR - 1} to {fub.asOf || '…'} (Follow Up Boss), annualised.
            Transactions = (operating costs + debt + profit) ÷ Luxe revenue per deal, rounded up.
          </p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Quarterly checkpoints {PLAN_YEAR}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {p.quarterly_checkpoints.map((c, i) => (
            <div key={c.q} className="rounded-lg border border-border p-3 space-y-2 min-w-0">
              <p className="text-sm font-semibold text-foreground">Q{c.q}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['low', 'high'] as const).map(k => (
                  <div key={k} className="space-y-1"><Label htmlFor={`q${c.q}${k}`} className="text-xs capitalize">{k}</Label>
                    <Input id={`q${c.q}${k}`} type="number" value={c[k] ?? ''} onChange={e => setP({
                      ...p, quarterly_checkpoints: p.quarterly_checkpoints.map((x, j) => j === i ? { ...x, [k]: e.target.value === '' ? null : Number(e.target.value) } : x),
                    })} /></div>
                ))}
              </div>
            </div>
          ))}
          <p className="col-span-2 lg:col-span-4 text-xs text-muted-foreground">Monthly comparison with actual {PLAN_YEAR} closings will appear here once {PLAN_YEAR} starts.</p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Company plan settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {num('operating_costs', 'All-in operating costs')}
            {num('debt_total', 'Debt (total)')}
            {num('luxe_revenue_per_deal', 'Luxe revenue per deal')}
            {num('gci_per_deal', 'GCI per deal')}
            {num('deals_per_agent', 'Deals per new agent', '')}
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            {p.profit_tiers.map((t, i) => (
              <div key={i} className="space-y-1"><Label htmlFor={`tier${i}`} className="text-xs">Profit tier {i + 1}</Label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input id={`tier${i}`} type="number" className="pl-6" value={t} onChange={e => setP({ ...p, profit_tiers: p.profit_tiers.map((x, j) => j === i ? Number(e.target.value || 0) : x) })} /></div></div>
            ))}
          </div>
          <Button onClick={save} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save company plan</Button>
        </CardContent>
      </Card>
    </div>
  );
}
