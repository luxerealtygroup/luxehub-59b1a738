import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, History, NotebookPen, Calculator, Compass, Pencil, Save, Send, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import {
  PLAN_YEAR, PlanningSettings, GoalInputs, PlanningGoalRow, PreworkRow, RecapRow, computeGoal, splitQuarters, PREWORK_SAVE_KEYS,
} from '@/lib/planning2027';
import { GoalResultsView } from './GoalResultsView';
import { usePriorYearActuals, usePriorYearGoal } from './usePriorYearActuals';
import { useRecap } from './useRecap';
import { RecapSection, ReflectionSection, GoalComparison, WayForwardSection, weeklyDefaults } from './PlanSections';
import { GoalExercises, kpiDefaults } from './SessionExercises';

type RateKey = 'avg_sale_price' | 'commission_rate' | 'appt_to_close_rate' | 'lead_to_appt_rate';

const EMPTY_PREWORK: PreworkRow = { wins_2026: null, challenges_2026: null, top_lead_sources: null, team_change_suggestion: null };

/** Fill any blank derived fields (recap copy, weekly numbers, milestones) so what the agent sees is what gets saved. */
export function withDefaults(p: PreworkRow, recap: RecapRow | null, results: ReturnType<typeof computeGoal> | null, actuals: Parameters<typeof weeklyDefaults>[1]): PreworkRow {
  const out = { ...p };
  if (recap) {
    out.recap_wins ??= recap.wins; out.recap_challenges ??= recap.challenges;
    out.recap_commitments ??= recap.commitments; out.recap_lead_sources ??= recap.lead_sources;
  }
  if (out.weekly_conversations == null && out.weekly_appointments == null && out.weekly_leads == null) Object.assign(out, weeklyDefaults(results, actuals));
  const k = out.exercises?.kpis;
  if (!k || Object.values(k).every(v => v == null)) out.exercises = { ...(out.exercises ?? {}), kpis: kpiDefaults(results, actuals) };
  if (!out.quarterly_milestones?.length) out.quarterly_milestones = splitQuarters(results?.deals_needed ?? null, results?.gci_goal ?? null);
  out.lead_source_focus = (out.lead_source_focus ?? []).filter(s => s.source.trim());
  out.action_plan = (out.action_plan ?? []).filter(a => a.action.trim());
  return out;
}

export function AgentPlanner({ agentId, fubUserId, hasFUB, agentName, settings, pastDeadline, onStatus, canRegenerate }: {
  agentId: string; fubUserId: number | null; hasFUB: boolean; agentName: string | null;
  settings: PlanningSettings; pastDeadline: boolean; onStatus: (s: PlanningGoalRow['status'] | null) => void; canRegenerate?: boolean;
}) {
  const actuals = usePriorYearActuals(agentId, fubUserId, hasFUB, agentName);
  const goal2026 = usePriorYearGoal(agentId);
  const { recap, loading: recapLoading, working, regenerate } = useRecap(agentId, true);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<PlanningGoalRow | null>(null);
  const [inputs, setInputs] = useState<GoalInputs | null>(null);
  const [sources, setSources] = useState<Record<RateKey, '2026 actuals' | 'Team default' | 'Saved'>>({} as any);
  const [prework, setPreworkState] = useState<PreworkRow>(EMPTY_PREWORK);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('recap');
  const seeded = useRef(false);
  const setPrework = useCallback((fn: (p: PreworkRow) => PreworkRow) => setPreworkState(fn), []);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, p] = await Promise.all([
      supabase.from('planning_goals').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
      supabase.from('planning_prework').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
    ]);
    const row = (g.data as PlanningGoalRow) ?? null;
    setSaved(row);
    onStatus(row?.status ?? null);
    if (p.data) setPreworkState(p.data as unknown as PreworkRow);
    setLoading(false);
  }, [agentId, onStatus]);
  useEffect(() => { load(); }, [load]);

  // Seed Reflection wins/challenges/lead sources from the coaching recap the first time.
  useEffect(() => {
    if (loading || !recap || seeded.current) return;
    seeded.current = true;
    setPreworkState(p => ({
      ...p,
      wins_2026: p.wins_2026 || p.recap_wins || recap.wins,
      challenges_2026: p.challenges_2026 || p.recap_challenges || recap.challenges,
      top_lead_sources: p.top_lead_sources || p.recap_lead_sources || recap.lead_sources,
    }));
  }, [loading, recap]);

  useEffect(() => {
    if (loading || actuals.loading || inputs) return;
    if (saved) {
      setInputs({
        goal_input_type: saved.goal_input_type, net_income_goal: saved.net_income_goal, gci_goal: saved.gci_goal,
        avg_sale_price: saved.avg_sale_price, commission_rate: saved.commission_rate, agent_split_pct: saved.agent_split_pct,
        appt_to_close_rate: saved.appt_to_close_rate, lead_to_appt_rate: saved.lead_to_appt_rate,
      });
      setSources({ avg_sale_price: 'Saved', commission_rate: 'Saved', appt_to_close_rate: 'Saved', lead_to_appt_rate: 'Saved' });
      return;
    }
    const pick = (a: number | null, d: number): [number, '2026 actuals' | 'Team default'] => (a != null ? [a, '2026 actuals'] : [d, 'Team default']);
    const [price, sp] = pick(actuals.avgSalePrice, settings.avg_sale_price);
    const [comm, sc] = pick(actuals.commissionRate, settings.commission_rate);
    const [a2c, sa] = pick(actuals.apptToClose, settings.appt_to_close_rate);
    const [l2a, sl] = pick(actuals.leadToAppt, settings.lead_to_appt_rate);
    setInputs({
      goal_input_type: 'net', net_income_goal: null, gci_goal: null,
      avg_sale_price: price, commission_rate: comm, agent_split_pct: settings.agent_split_pct,
      appt_to_close_rate: a2c, lead_to_appt_rate: l2a,
    });
    setSources({ avg_sale_price: sp, commission_rate: sc, appt_to_close_rate: sa, lead_to_appt_rate: sl });
  }, [loading, actuals, saved, settings, inputs]);

  const results = useMemo(() => (inputs ? computeGoal(inputs) : null), [inputs]);

  // Seed weekly commitments from the calculator the first time a goal exists.
  useEffect(() => {
    if (!results?.appointments_needed) return;
    setPreworkState(p => (p.weekly_conversations == null && p.weekly_appointments == null && p.weekly_leads == null
      ? { ...p, ...weeklyDefaults(results, actuals) } : p));
    setPreworkState(p => {
      const k = p.exercises?.kpis;
      return !k || Object.values(k).every(v => v == null) ? { ...p, exercises: { ...(p.exercises ?? {}), kpis: kpiDefaults(results, actuals) } } : p;
    });
  }, [results, actuals]);
  const status = saved?.status ?? 'draft';
  const editable = !pastDeadline && status === 'draft';

  const set = (k: keyof GoalInputs, v: string) =>
    setInputs(i => (i ? { ...i, [k]: v === '' ? null : Number(v) } : i));

  const switchType = (t: string) => {
    if (!t || !inputs || !results || t === inputs.goal_input_type) return;
    setInputs({ ...inputs, goal_input_type: t as 'net' | 'gci', net_income_goal: results.net_income_goal, gci_goal: results.gci_goal });
  };

  const rateSource = () => {
    const vals = Object.values(sources);
    if (vals.every(v => v === '2026 actuals')) return '2026 actuals';
    if (vals.every(v => v === 'Team default')) return 'Team defaults';
    if (vals.every(v => v === 'Saved')) return saved?.rate_source ?? 'Saved';
    return 'Mixed: 2026 actuals where available, team defaults otherwise';
  };

  const save = async (next: 'draft' | 'submitted') => {
    if (!inputs) return;
    if (next === 'submitted' && (inputs.goal_input_type === 'net' ? !inputs.net_income_goal : !inputs.gci_goal)) {
      toast.error('Enter your goal on the 2027 Goals tab before submitting'); setTab('goals'); return;
    }
    const full = withDefaults(prework, recap, results, actuals);
    if (next === 'submitted' && (full.action_plan?.length ?? 0) < 3) {
      toast.error('Add at least 3 actions to your 90-day plan'); setTab('forward'); return;
    }
    setBusy(true);
    const g = await supabase.from('planning_goals').upsert({
      agent_id: agentId, plan_year: PLAN_YEAR, ...inputs, rate_source: rateSource(), status: next,
    }, { onConflict: 'agent_id,plan_year' });
    const payload: Record<string, unknown> = { agent_id: agentId, plan_year: PLAN_YEAR, status: next };
    for (const k of PREWORK_SAVE_KEYS) payload[k] = (full as any)[k] ?? null;
    const p = g.error ? null : await supabase.from('planning_prework').upsert(payload as any, { onConflict: 'agent_id,plan_year' });
    setBusy(false);
    const err = g.error || p?.error;
    if (err) { toast.error(err.message); return; }
    toast.success(next === 'submitted' ? 'Plan submitted' : 'Draft saved');
    await load();
  };

  const reopenForEdit = async () => {
    if (!saved) return;
    setBusy(true);
    const { error } = await supabase.from('planning_goals').update({ status: 'draft' }).eq('id', saved.id);
    if (!error) await supabase.from('planning_prework').update({ status: 'draft' }).eq('agent_id', agentId).eq('plan_year', PLAN_YEAR);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  if (loading || !inputs || !results) {
    return <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin text-gold" />Loading your 2026 numbers…</div>;
  }


  const goalField = inputs.goal_input_type === 'net' ? 'net_income_goal' : 'gci_goal';
  const rateInput = (k: RateKey | 'agent_split_pct', label: string, suffix: string) => (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={k} className="text-xs">{label}</Label>
      <div className="relative">
        <Input id={k} type="number" inputMode="decimal" step="any" disabled={!editable}
          value={inputs[k] ?? ''} onChange={e => set(k, e.target.value)} className={suffix === '%' ? 'pr-7' : 'pl-6'} />
        <span className={`absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground ${suffix === '%' ? 'right-3' : 'left-3'}`}>{suffix}</span>
      </div>
      {k !== 'agent_split_pct' && sources[k as RateKey] && (
        <p className="text-[11px] text-muted-foreground">From: {sources[k as RateKey]}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
          <TabsTrigger value="recap" className="gap-2"><History className="h-4 w-4" />2026 Recap</TabsTrigger>
          <TabsTrigger value="reflection" className="gap-2"><NotebookPen className="h-4 w-4" />Reflection</TabsTrigger>
          <TabsTrigger value="goals" className="gap-2"><Calculator className="h-4 w-4" />2027 Goals</TabsTrigger>
          <TabsTrigger value="forward" className="gap-2"><Compass className="h-4 w-4" />Way Forward</TabsTrigger>
        </TabsList>

        <TabsContent value="recap" className="mt-4">
          <RecapSection agentId={agentId} actuals={actuals} goal2026={goal2026} recap={recap} recapLoading={recapLoading}
            regenerating={working} canRegenerate={!!canRegenerate} onRegenerate={regenerate}
            prework={prework} setPrework={setPrework} editable={editable} />
        </TabsContent>

        <TabsContent value="reflection" className="mt-4">
          <ReflectionSection prework={prework} setPrework={setPrework} editable={editable} />
        </TabsContent>

        <TabsContent value="goals" className="mt-4 space-y-4">
          <Card><CardContent className="p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm font-medium text-foreground">Set my goal by:</span>
              <ToggleGroup type="single" value={inputs.goal_input_type} onValueChange={switchType} disabled={!editable} className="justify-start">
                <ToggleGroupItem value="net" aria-label="Net Income">Net Income</ToggleGroupItem>
                <ToggleGroupItem value="gci" aria-label="Total GCI">Total GCI</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="goal" className="text-xs">{inputs.goal_input_type === 'net' ? 'My 2027 net income goal' : 'My 2027 total GCI goal'}</Label>
                <div className="relative">
                  <Input id="goal" type="number" inputMode="numeric" disabled={!editable} className="pl-6 text-lg font-semibold"
                    value={inputs[goalField] ?? ''} onChange={e => set(goalField, e.target.value)} />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{inputs.goal_input_type === 'net' ? 'Total GCI (calculated)' : 'Net income (calculated)'}</Label>
                <div className="h-10 flex items-center rounded-md border border-dashed border-border px-3 text-lg font-semibold text-foreground">
                  {formatCurrency(inputs.goal_input_type === 'net' ? results.gci_goal : results.net_income_goal)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {rateInput('avg_sale_price', 'Avg sale price', '$')}
              {rateInput('commission_rate', 'Commission', '%')}
              {rateInput('agent_split_pct', 'Agent split', '%')}
              {rateInput('appt_to_close_rate', 'Appt → close', '%')}
              {rateInput('lead_to_appt_rate', 'Lead → appt', '%')}
            </div>
            {actuals.rateNote && sources.appt_to_close_rate === 'Team default' && (
              <p className="text-xs text-muted-foreground">Conversion rates: {actuals.rateNote}.</p>
            )}
          </CardContent></Card>
          <GoalResultsView r={results} inputType={inputs.goal_input_type} />
          <GoalComparison actuals={actuals} r={results} />
          <GoalExercises prework={prework} setPrework={setPrework} editable={editable} />
        </TabsContent>

        <TabsContent value="forward" className="mt-4">
          <WayForwardSection prework={prework} setPrework={setPrework} editable={editable} results={results} actuals={actuals} agentId={agentId} />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 pl-1 pr-20 sm:pr-1 py-3 backdrop-blur">
        {status === 'approved' && <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Approved — locked.</p>}
        {status !== 'approved' && pastDeadline && <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Deadline passed — locked.</p>}
        {status === 'submitted' && !pastDeadline && (
          <>
            <p className="mr-auto text-sm text-muted-foreground">Submitted — read-only.</p>
            <Button variant="outline" onClick={reopenForEdit} disabled={busy} className="gap-2"><Pencil className="h-4 w-4" />Edit</Button>
          </>
        )}
        {editable && (
          <>
            <Button variant="outline" onClick={() => save('draft')} disabled={busy} className="gap-2"><Save className="h-4 w-4" />Save Draft</Button>
            <Button onClick={() => save('submitted')} disabled={busy} className="gap-2"><Send className="h-4 w-4" />Submit</Button>
          </>
        )}
      </div>
    </div>
  );
}
