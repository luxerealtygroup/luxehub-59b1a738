import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowUpDown, AlertCircle, Settings } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PLAN_YEAR, PlanningGoalRow } from '@/lib/planning2027';
import { StatusBadge } from './StatusBadge';
import { AgentPlanDetail } from './AgentPlanDetail';

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

export function AdminPlanningOverview({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'status', asc: true });
  const [open, setOpen] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const [agents, goals] = await Promise.all([
      supabase.rpc('get_team_agents'),
      supabase.from('planning_goals').select('*').eq('plan_year', PLAN_YEAR),
    ]);
    const byAgent = new Map((goals.data as PlanningGoalRow[] | null ?? []).map(g => [g.agent_id, g]));
    setRows((agents.data ?? []).map((a: any) => ({ id: a.id, name: a.full_name || a.email, goal: byAgent.get(a.id) ?? null })));
    setLoading(false);
  }, []);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-2"><Settings className="h-4 w-4" />Planning settings</Button>
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
}
