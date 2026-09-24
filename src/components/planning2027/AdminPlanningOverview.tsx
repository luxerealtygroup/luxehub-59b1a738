import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowUpDown, AlertCircle, Settings } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PLAN_YEAR, PlanningGoalRow, PlanningSettings } from '@/lib/planning2027';
import { TeamRecap } from './TeamRecap';
import { useTeamActuals } from './useTeamActuals';
import { StatusBadge } from './StatusBadge';
import { AgentPlanDetail } from './AgentPlanDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/hooks/useTenant';
import { useTeamFubTotals } from './useTeamFubTotals';
import { CompanyPlan, useCompanyPlan } from './CompanyPlan';
import { SessionCapture } from './SessionCapture';

interface Row {
  id: string; name: string; goal: PlanningGoalRow | null;
}
type SortKey = 'name' | 'status' | 'net' | 'gci' | 'deals' | 'volume' | 'appts' | 'leads' | 'submitted';

const val = (r: Row, k: SortKey): number | string => {
  const g = r.goal;
  switch (k) {
    case 'name': return r.name.toLowerCase();
    case 'status': return g ? ({ draft: 1, submitted: 2, approved: 3 } as const)[g.status] : 0;
    case 'net': return g?.net_income_goal ?? -1;
    case 'gci': return g?.gci_goal ?? -1;
    case 'deals': return g?.deals_needed ?? -1;
    case 'volume': return g?.volume_needed ?? -1;
    case 'appts': return g?.appointments_needed ?? -1;
    case 'leads': return g?.leads_needed ?? -1;
    case 'submitted': return g?.submitted_at ?? '';
  }
};

const m = (v: number | null | undefined) => (v == null ? '—' : formatCurrency(v));
const n = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v));
const d = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }) : '—');

export function AdminPlanningOverview({ onOpenSettings, settings, recap, tab, onTab }: {
  onOpenSettings: () => void; settings: PlanningSettings; recap?: React.ReactNode; tab?: string; onTab?: (t: string) => void;
}) {
  const selling = settings.selling_agent_ids ?? [];
  const team = useTeamActuals(selling);
  const fub = useTeamFubTotals(2026);
  const company = useCompanyPlan();
  const tenant = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'status', asc: true });
  const [open, setOpen] = useState<Row | null>(null);
  const [companyGoal, setCompanyGoal] = useState<{ gci: number; deals: number } | null>(null);
  useEffect(() => {
    supabase.from('company_goals').select('annual_gci_goal, annual_deals_goal').eq('year', 2026).maybeSingle()
      .then(({ data }) => data && setCompanyGoal({ gci: Number(data.annual_gci_goal ?? 0), deals: Number(data.annual_deals_goal ?? 0) }));
  }, []);

  const load = useCallback(async () => {
    const [agents, goals] = await Promise.all([
      supabase.rpc('get_team_agents'),
      supabase.from('planning_goals').select('*').eq('plan_year', PLAN_YEAR),
    ]);
    const byAgent = new Map((goals.data as PlanningGoalRow[] | null ?? []).map(g => [g.agent_id, g]));
    setRows((agents.data ?? []).filter((a: any) => selling.includes(a.id)).map((a: any) => ({ id: a.id, name: a.full_name || a.email, goal: byAgent.get(a.id) ?? null })));
    setLoading(false);
  }, [selling.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = val(a, sort.k), y = val(b, sort.k);
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1);
  }), [rows, sort]);

  const t = useMemo(() => {
    const done = rows.filter(r => r.goal && r.goal.status !== 'draft');
    const s = (f: (g: PlanningGoalRow) => number | null) => done.reduce((a, r) => a + (f(r.goal!) ?? 0), 0);
    return {
      submitted: done.length, total: rows.length,
      net: s(g => g.net_income_goal), gci: s(g => g.gci_goal), deals: s(g => g.deals_needed),
      volume: s(g => g.volume_needed), appts: s(g => g.appointments_needed), leads: s(g => g.leads_needed),
    };
  }, [rows]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;

  const H = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <TableHead className={`whitespace-nowrap ${right ? 'text-right' : ''}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort(s => ({ k, asc: s.k === k ? !s.asc : true }))}>
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );
  const notSubmitted = (r: Row) => !r.goal || r.goal.status === 'draft';

  // Team production uses full team GCI straight from Follow Up Boss (each deal once), not the agent-share sum.
  const recapTotals = { ...team.totals, gci: fub.gci, volume: fub.volume, closings: fub.units, leases: fub.leases, weightedUnits: fub.weightedUnits, fubLeads: fub.newContacts, companyGci: companyGoal?.gci ?? 0, companyDeals: companyGoal?.deals ?? 0 };

  const overview = (
    <div className="space-y-6">
      {team.probes}
      <TeamRecap totals={recapTotals} loading={team.loading || fub.loading} goals={rows.filter(r => r.goal && r.goal.status !== 'draft').map(r => r.goal!)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground min-w-0">Selling agents counted ({rows.length}): {rows.map(r => r.name).sort().join(', ') || 'none — choose them in Planning settings'}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Submitted', `${t.submitted} / ${t.total}`],
          ['Team net income goal', m(t.net)],
          ['Team total GCI goal', m(t.gci)],
          ['Deals', n(t.deals)],
          ['Volume', m(t.volume)],
          ['Appointments', n(t.appts)],
          ['Leads', n(t.leads)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card p-4 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground break-words">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Team totals include submitted and approved plans only.</p>

      {/* Phone: stacked cards */}
      <div className="space-y-2 md:hidden">
        {sorted.map(r => (
          <button key={r.id} onClick={() => setOpen(r)} className={`w-full text-left rounded-lg border p-3 ${notSubmitted(r) ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground break-words">{r.name}</span>
              <StatusBadge status={r.goal?.status ?? null} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Net</span><span className="text-right">{m(r.goal?.net_income_goal)}</span>
              <span className="text-muted-foreground">GCI</span><span className="text-right">{m(r.goal?.gci_goal)}</span>
              <span className="text-muted-foreground">Deals / Appts / Leads</span><span className="text-right">{n(r.goal?.deals_needed)} / {n(r.goal?.appointments_needed)} / {n(r.goal?.leads_needed)}</span>
              <span className="text-muted-foreground">Submitted</span><span className="text-right">{d(r.goal?.submitted_at)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow>
            <H k="name" label="Agent" /><H k="status" label="Status" /><H k="net" label="Net goal" right /><H k="gci" label="GCI goal" right />
            <H k="deals" label="Deals" right /><H k="volume" label="Volume" right /><H k="appts" label="Appts" right /><H k="leads" label="Leads" right /><H k="submitted" label="Submitted" right />
          </TableRow></TableHeader>
          <TableBody>
            {sorted.map(r => (
              <TableRow key={r.id} className={`cursor-pointer ${notSubmitted(r) ? 'bg-destructive/5' : ''}`} onClick={() => setOpen(r)}>
                <TableCell className="font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">{notSubmitted(r) && <AlertCircle className="h-4 w-4 text-destructive" aria-label="Not submitted" />}{r.name}</span>
                </TableCell>
                <TableCell><StatusBadge status={r.goal?.status ?? null} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">{m(r.goal?.net_income_goal)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{m(r.goal?.gci_goal)}</TableCell>
                <TableCell className="text-right">{n(r.goal?.deals_needed)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{m(r.goal?.volume_needed)}</TableCell>
                <TableCell className="text-right">{n(r.goal?.appointments_needed)}</TableCell>
                <TableCell className="text-right">{n(r.goal?.leads_needed)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{d(r.goal?.submitted_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          {open && <AgentPlanDetail agentId={open.id} agentName={open.name} canReview onChanged={load} />}
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <Tabs {...(tab ? { value: tab, onValueChange: onTab } : { defaultValue: 'team' })}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="team">{PLAN_YEAR} Team Plans</TabsTrigger>
        {company.row && <TabsTrigger value="company">Company Plan</TabsTrigger>}
        <TabsTrigger value="session">Session</TabsTrigger>
        {recap && <TabsTrigger value="recap">2026 Recap</TabsTrigger>}
      </TabsList>
      <TabsContent value="team" className="mt-4">{overview}</TabsContent>
      {company.row && (
        <TabsContent value="company" className="mt-4">
          <CompanyPlan plan={company.row} onSaved={company.reload} fub={fub} agentDealGoals={{ submitted: t.submitted, deals: t.deals, total: t.total }} />
        </TabsContent>
      )}
      <TabsContent value="session" className="mt-4"><SessionCapture orgId={tenant.orgId} /></TabsContent>
      {recap && <TabsContent value="recap" className="mt-4">{recap}</TabsContent>}
    </Tabs>
  );
}
