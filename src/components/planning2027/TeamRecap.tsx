import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PlanningGoalRow } from '@/lib/planning2027';

const m = (v: number) => formatCurrency(v);
const n = (v: number) => formatNumber(v);
const pctOf = (a: number, g: number) => (g ? `${Math.round((a / g) * 100)}% of goal` : 'no goal set');

export function TeamRecap({ totals, loading, goals }: {
  totals: { gci: number; volume: number; closings: number; appts: number; leads: number; goalGci: number; goalDeals: number; goalVolume: number };
  loading: boolean; goals: PlanningGoalRow[];
}) {
  const [themes, setThemes] = useState<{ wins: string; challenges: string; lead_sources: string } | null>(null);
  const [agents, setAgents] = useState(0);
  const [busy, setBusy] = useState(false);
  const g27 = goals.reduce((t, g) => ({
    gci: t.gci + (g.gci_goal ?? 0), net: t.net + (g.net_income_goal ?? 0), deals: t.deals + (g.deals_needed ?? 0),
    volume: t.volume + (g.volume_needed ?? 0), appts: t.appts + (g.appointments_needed ?? 0), leads: t.leads + (g.leads_needed ?? 0),
  }), { gci: 0, net: 0, deals: 0, volume: 0, appts: 0, leads: 0 });

  const summarize = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('planning-recap', { body: { team: true } });
    setBusy(false);
    const msg = (data as any)?.error || error?.message;
    if (msg) { toast.error(msg); return; }
    if (!(data as any)?.themes) { toast.info('No reflections or coaching recaps to summarize yet'); return; }
    setThemes((data as any).themes); setAgents((data as any).agents ?? 0);
  };

  const Box = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
    <div className="rounded-lg border border-border bg-card p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-lg sm:text-xl font-bold text-foreground break-words">{v}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <Card className="border-gold/40">
      <CardHeader className="pb-2"><CardTitle className="text-lg font-display">Team Recap</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">2026 actual vs 2026 goal</p>
          {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-gold" />Adding up each agent's 2026 numbers…</p> : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Box k="Team GCI (full)" v={m(totals.gci)} sub={`${pctOf(totals.gci, totals.goalGci)} (${m(totals.goalGci)})`} />
              <Box k="Closed deals" v={n(totals.closings)} sub={`${pctOf(totals.closings, totals.goalDeals)} (${n(totals.goalDeals)})`} />
              <Box k="Volume" v={m(totals.volume)} sub={totals.goalVolume ? `${pctOf(totals.volume, totals.goalVolume)} (${m(totals.goalVolume)})` : undefined} />
              <Box k="Appointments" v={n(totals.appts)} />
              <Box k="Leads" v={n(totals.leads)} />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">2027 goal totals <span className="font-normal text-muted-foreground">· {goals.length} plan{goals.length === 1 ? '' : 's'} submitted or approved</span></p>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Box k="Net income" v={m(g27.net)} /><Box k="GCI" v={m(g27.gci)} /><Box k="Deals" v={n(g27.deals)} />
            <Box k="Volume" v={m(g27.volume)} /><Box k="Appointments" v={n(g27.appts)} /><Box k="Leads" v={n(g27.leads)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Most common across agents</p>
            <Button size="sm" variant="outline" onClick={summarize} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{themes ? 'Refresh themes' : 'Summarize themes'}
            </Button>
          </div>
          {themes ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {([['wins', 'Wins'], ['challenges', 'Challenges'], ['lead_sources', 'Lead sources']] as const).map(([k, label]) => (
                <div key={k} className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{themes[k] || '—'}</p>
                </div>
              ))}
              <p className="lg:col-span-3 text-xs text-muted-foreground">Draft summary of {agents} agents' reflections and coaching recaps.</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">Summarizes the wins, challenges and lead sources from every selling agent's reflection and coaching recap.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
