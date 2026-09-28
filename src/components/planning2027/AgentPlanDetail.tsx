import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useHasFUB } from '@/hooks/useHasFUB';
import { PLAN_YEAR, PlanningGoalRow, PreworkRow } from '@/lib/planning2027';
import { GoalResultsView } from './GoalResultsView';
import { StatusBadge } from './StatusBadge';
import { usePriorYearActuals, usePriorYearGoal } from './usePriorYearActuals';
import { useRecap } from './useRecap';
import { RecapSection, ReflectionSection, GoalComparison, WayForwardSection } from './PlanSections';
import { GoalExercises } from './SessionExercises';
import { SevenCirclesCollapsed, SevenCirclesSection, Circles } from './SevenCircles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Section({ n, title, children, tabbed }: { n: number; title: string; children: React.ReactNode; tabbed?: boolean }) {
  if (tabbed) return <TabsContent value={String(n)} className="mt-4 space-y-3">{children}</TabsContent>;
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-3 text-lg font-display font-semibold text-foreground">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm text-gold">{n}</span>{title}
      </h3>
      {children}
    </section>
  );
}

/** Full read-only plan in the same four-part order as the agent sees it, with admin Approve / Reopen. */
export function AgentPlanDetail({ agentId, agentName, canReview, onChanged, tabbed }: {
  agentId: string; agentName: string; canReview: boolean; onChanged?: () => void; tabbed?: boolean;
}) {
  const { hasFUB } = useHasFUB();
  const [fub, setFub] = useState<{ id: number | null; name: string | null } | null>(null);
  const [goal, setGoal] = useState<PlanningGoalRow | null>(null);
  const [prework, setPrework] = useState<PreworkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [circles, setCircles] = useState<Circles | null>(null);
  const [busy, setBusy] = useState(false);
  const actuals = usePriorYearActuals(fub ? agentId : null, fub?.id ?? null, hasFUB, fub?.name ?? null);
  const goal2026 = usePriorYearGoal(agentId);
  const { recap, loading: recapLoading, working, regenerate } = useRecap(agentId, canReview);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, p, prof] = await Promise.all([
      supabase.from('planning_goals').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
      supabase.from('planning_prework').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
      supabase.from('profiles').select('fub_user_id, full_name').eq('id', agentId).maybeSingle(),
    ]);
    // Private: RLS returns a row only to the agent and the Company Plan owner (Kristen).
    const c = await (supabase.from('planning_circles' as any) as any).select('circles').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle();
    setCircles((c.data?.circles as Circles) ?? null);
    setGoal((g.data as PlanningGoalRow) ?? null);
    setPrework((p.data as unknown as PreworkRow) ?? null);
    setFub({ id: (prof.data as any)?.fub_user_id ?? null, name: (prof.data as any)?.full_name ?? agentName });
    setLoading(false);
  }, [agentId, agentName]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: 'approved' | 'submitted') => {
    if (!goal) return;
    setBusy(true);
    const { error } = await supabase.from('planning_goals').update({ status }).eq('id', goal.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'approved' ? 'Plan approved' : 'Plan reopened');
    await load();
    onChanged?.();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  const pw: PreworkRow = prework ?? { wins_2026: null, challenges_2026: null, top_lead_sources: null, team_change_suggestion: null };

  return (
    <div className="space-y-8 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground break-words">{agentName}</h2>
          <p className="text-sm text-muted-foreground">{PLAN_YEAR} business plan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={goal?.status ?? null} />
          {canReview && goal && goal.status === 'submitted' && (
            <Button onClick={() => setStatus('approved')} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4" />Approve</Button>
          )}
          {canReview && goal && goal.status === 'approved' && (
            <Button variant="outline" onClick={() => setStatus('submitted')} disabled={busy} className="gap-2"><RotateCcw className="h-4 w-4" />Reopen</Button>
          )}
        </div>
      </div>

      {tabbed ? (
      <Tabs defaultValue="1">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="1">2026 Recap</TabsTrigger><TabsTrigger value="2">Reflection</TabsTrigger>
          <TabsTrigger value="3">2027 Goals</TabsTrigger><TabsTrigger value="4">Way Forward</TabsTrigger>
        </TabsList>
        {sections}
      </Tabs>) : sections}
    </div>
  );
}
 title="2026 Recap">
        <RecapSection agentId={agentId} fubUserId={fub?.id ?? null} actuals={actuals} goal2026={goal2026} recap={recap} recapLoading={recapLoading}
          regenerating={working} canRegenerate={canReview} onRegenerate={regenerate} prework={pw} editable={false} />
      </Section>

      <Section tabbed={tabbed} n={2} title="Reflection">
        {tabbed ? (circles ? <SevenCirclesSection circles={circles} editable={false} /> : <p className="text-sm text-muted-foreground">Seven circles: not scored yet.</p>)
          : circles ? <SevenCirclesCollapsed circles={circles} /> : <p className="text-sm text-muted-foreground">Seven circles (private): not scored yet.</p>}
        <ReflectionSection prework={pw} editable={false} />
      </Section>

      <Section tabbed={tabbed} n={3} title="2027 Goals">
        {!goal ? <p className="text-sm text-muted-foreground">No goal saved yet.</p> : (
          <div className="space-y-4">
            <GoalResultsView r={goal} inputType={goal.goal_input_type} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              {[
                ['Avg sale price', goal.avg_sale_price != null ? formatCurrency(goal.avg_sale_price) : '—'],
                ['Commission', `${goal.commission_rate ?? '—'}%`],
                ['Agent split', `${goal.agent_split_pct ?? '—'}%`],
                ['Appt → close', `${goal.appt_to_close_rate ?? '—'}%`],
                ['Lead → appt', `${goal.lead_to_appt_rate ?? '—'}%`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border border-border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold text-foreground">{v}</p></div>
              ))}
            </div>
            {goal.rate_source && <p className="text-xs text-muted-foreground">Rates source: {goal.rate_source}</p>}
            {!actuals.loading && <GoalComparison actuals={actuals} r={goal} />}
          </div>
        )}
        <GoalExercises prework={pw} editable={false} />
      </Section>

      <Section tabbed={tabbed} n={4} title="Way Forward">
        {prework ? <WayForwardSection prework={pw} editable={false} results={goal} actuals={actuals} agentId={agentId} />
          : <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
      </Section>
    </div>
  );
}
