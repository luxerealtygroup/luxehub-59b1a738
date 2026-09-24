import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { PLAN_YEAR, PlanningGoalRow, PreworkRow } from '@/lib/planning2027';
import { GoalResultsView } from './GoalResultsView';
import { StatusBadge } from './StatusBadge';

const PREWORK_FIELDS: [keyof PreworkRow, string][] = [
  ['wins_2026', '2026 wins'],
  ['challenges_2026', '2026 challenges'],
  ['top_lead_sources', 'Top lead sources'],
  ['team_change_suggestion', 'One change I would suggest for the team'],
];

/** Full read-only view of one agent's plan, with admin Approve / Reopen. */
export function AgentPlanDetail({ agentId, agentName, canReview, onChanged }: {
  agentId: string; agentName: string; canReview: boolean; onChanged?: () => void;
}) {
  const [goal, setGoal] = useState<PlanningGoalRow | null>(null);
  const [prework, setPrework] = useState<PreworkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, p] = await Promise.all([
      supabase.from('planning_goals').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
      supabase.from('planning_prework').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle(),
    ]);
    setGoal((g.data as PlanningGoalRow) ?? null);
    setPrework((p.data as PreworkRow) ?? null);
    setLoading(false);
  }, [agentId]);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground break-words">{agentName}</h2>
          <p className="text-sm text-muted-foreground">{PLAN_YEAR} goal and pre-work</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={goal?.status ?? null} />
          {canReview && goal && goal.status === 'submitted' && (
            <Button onClick={() => setStatus('approved')} disabled={busy} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />Approve
            </Button>
          )}
          {canReview && goal && goal.status === 'approved' && (
            <Button variant="outline" onClick={() => setStatus('submitted')} disabled={busy} className="gap-2">
              <RotateCcw className="h-4 w-4" />Reopen
            </Button>
          )}
        </div>
      </div>

      {!goal ? (
        <p className="text-sm text-muted-foreground">No goal saved yet.</p>
      ) : (
        <>
          <GoalResultsView r={goal} inputType={goal.goal_input_type} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
            {[
              ['Avg sale price', goal.avg_sale_price != null ? formatCurrency(goal.avg_sale_price) : '—'],
              ['Commission', `${goal.commission_rate ?? '—'}%`],
              ['Agent split', `${goal.agent_split_pct ?? '—'}%`],
              ['Appt → close', `${goal.appt_to_close_rate ?? '—'}%`],
              ['Lead → appt', `${goal.lead_to_appt_rate ?? '—'}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border p-2">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="font-semibold text-foreground">{v}</p>
              </div>
            ))}
          </div>
          {goal.rate_source && <p className="text-xs text-muted-foreground">Rates source: {goal.rate_source}</p>}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PREWORK_FIELDS.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
            <p className="text-base text-foreground whitespace-pre-wrap break-words">{(prework?.[key] as string) || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
