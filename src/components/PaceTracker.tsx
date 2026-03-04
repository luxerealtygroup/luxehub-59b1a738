import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, Target, Zap, Loader2, Send, ArrowRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { currentYear, safe } from '@/components/business-planning/types';

interface PaceData {
  ytdClosedDeals: number;
  ytdGciGross: number;
  pendingDeals: number;
  pendingGci: number;
  annualDealsGoal: number;
  annualGciGoal: number;
  q2ClosingsGoal: number;
  q2GciTarget: number;
  avgSalePrice: number;
  commissionRate: number;
  avgCommissionGross: number;
  // 4-1-1 weekly averages (last 4 weeks)
  weeklyAvgDials: number;
  weeklyAvgContacts: number;
  weeklyAvgAppts: number;
  // Conversion rates
  contactToApptRate: number;
  dialToApptRate: number;
  apptToContractRate: number;
  // Pipeline
  pipelineDeficit: number;
  currentPipelineCount: number;
}

interface PaceProjections {
  daysElapsed: number;
  daysRemainingYear: number;
  projectedYearDeals: number;
  projectedYearGci: number;
  projectedQ2Deals: number;
  projectedQ2Gci: number;
  gapDealsYear: number;
  gapGciYear: number;
  gapDealsQ2: number;
  gapGciQ2: number;
}

function computePace(data: PaceData): PaceProjections {
  const today = new Date();
  const jan1 = new Date(currentYear, 0, 1);
  const dec31 = new Date(currentYear, 11, 31);
  const q2Start = new Date(currentYear, 3, 1);
  const q2End = new Date(currentYear, 5, 30);

  const daysElapsed = Math.max(1, Math.floor((today.getTime() - jan1.getTime()) / 86400000));
  const daysRemainingYear = Math.max(0, Math.floor((dec31.getTime() - today.getTime()) / 86400000));
  const totalDaysYear = 365;

  const dealPacePerDay = data.ytdClosedDeals / daysElapsed;
  const gciPacePerDay = data.ytdGciGross / daysElapsed;

  const projectedYearDeals = Math.round(dealPacePerDay * totalDaysYear);
  const projectedYearGci = Math.round(gciPacePerDay * totalDaysYear);

  // Q2 projection
  const q2DaysElapsed = Math.max(1, Math.floor((Math.min(today.getTime(), q2End.getTime()) - q2Start.getTime()) / 86400000));
  const q2TotalDays = Math.floor((q2End.getTime() - q2Start.getTime()) / 86400000);
  // Use YTD pace for Q2 projection (simplified)
  const projectedQ2Deals = Math.round(dealPacePerDay * q2TotalDays);
  const projectedQ2Gci = Math.round(gciPacePerDay * q2TotalDays);

  return {
    daysElapsed,
    daysRemainingYear,
    projectedYearDeals,
    projectedYearGci,
    projectedQ2Deals,
    projectedQ2Gci,
    gapDealsYear: data.annualDealsGoal - projectedYearDeals,
    gapGciYear: data.annualGciGoal - projectedYearGci,
    gapDealsQ2: data.q2ClosingsGoal - projectedQ2Deals,
    gapGciQ2: data.q2GciTarget - projectedQ2Gci,
  };
}

interface Props {
  userId: string | null;
  pipelineDeficit: number;
  currentPipelineCount: number;
  conversionRates: {
    contactToAppt: number;
    dialToAppt: number;
    apptToContract: number;
  };
  isReadOnly?: boolean;
}

export function PaceTracker({ userId, pipelineDeficit, currentPipelineCount, conversionRates, isReadOnly }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paceData, setPaceData] = useState<PaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResponse, setCoachResponse] = useState<{ lever: string; actions: string[]; targets: { dials: number; contacts: number; appts: number; pipeline: number } } | null>(null);
  const [applyingTargets, setApplyingTargets] = useState(false);

  const fetchPaceData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    const [metricsRes, goalsRes, prodGoalsRes, paRes, w411Res] = await Promise.all([
      // YTD closed + pending from deals/commissions or manual_production
      supabase.from('manual_production').select('*').eq('user_id', userId).eq('year', currentYear),
      supabase.from('agent_goals').select('target_value, goal_type, period')
        .eq('user_id', userId).eq('period', 'yearly'),
      supabase.from('production_goals').select('annual_gci_goal, annual_units_goal')
        .eq('user_id', userId).eq('year', currentYear).maybeSingle(),
      supabase.from('planning_assumptions').select('*')
        .eq('user_id', userId).eq('year', currentYear).eq('quarter', 2).maybeSingle(),
      // Last 4 weeks of 4-1-1
      supabase.from('weekly_411').select('dials, contacts_made, appointments_held, calls_actual, appointments_actual')
        .eq('user_id', userId).order('week_start_date', { ascending: false }).limit(4),
    ]);

    // Manual production totals
    const mp = (metricsRes.data || []).reduce(
      (acc, r) => ({
        closed: acc.closed + (r.closed_deals ?? 0),
        pending: acc.pending + (r.pending_deals ?? 0),
        gciClosed: acc.gciClosed + Number(r.gci_closed || 0),
        gciPending: acc.gciPending + Number(r.gci_pending || 0),
      }),
      { closed: 0, pending: 0, gciClosed: 0, gciPending: 0 }
    );

    // Goals
    const dealsGoalRow = (goalsRes.data || []).find(g => g.goal_type === 'deals_closed');
    const annualDealsGoal = safe(dealsGoalRow?.target_value);
    const annualGciGoal = safe(prodGoalsRes.data?.annual_gci_goal);

    // Planning assumptions
    const pa = paRes.data;
    const avgSalePrice = safe(pa?.avg_sale_price) || 500000;
    const avgComm = safe(pa?.avg_commission) || 15000;
    const commRate = avgSalePrice > 0 && avgComm > 0 ? avgComm / avgSalePrice : 0.03;
    const q2GciTarget = safe(pa?.gci_target) || (annualGciGoal / 4);
    const q2ClosingsGoal = q2GciTarget > 0 && avgComm > 0 ? Math.ceil(q2GciTarget / avgComm) : Math.ceil(annualDealsGoal / 4);

    // Weekly averages from 4-1-1
    const rows = w411Res.data || [];
    const weekCount = Math.max(1, rows.length);
    const totalDials = rows.reduce((s, r) => s + (r.dials || r.calls_actual || 0), 0);
    const totalContacts = rows.reduce((s, r) => s + (r.contacts_made || 0), 0);
    const totalAppts = rows.reduce((s, r) => s + (r.appointments_held || r.appointments_actual || 0), 0);

    setPaceData({
      ytdClosedDeals: mp.closed,
      ytdGciGross: mp.gciClosed,
      pendingDeals: mp.pending,
      pendingGci: mp.gciPending,
      annualDealsGoal,
      annualGciGoal,
      q2ClosingsGoal,
      q2GciTarget,
      avgSalePrice,
      commissionRate: commRate,
      avgCommissionGross: avgComm,
      weeklyAvgDials: Math.round(totalDials / weekCount),
      weeklyAvgContacts: Math.round(totalContacts / weekCount),
      weeklyAvgAppts: Math.round(totalAppts / weekCount),
      contactToApptRate: conversionRates.contactToAppt,
      dialToApptRate: conversionRates.dialToAppt,
      apptToContractRate: conversionRates.apptToContract,
      pipelineDeficit,
      currentPipelineCount,
    });
    setLoading(false);
  }, [userId, pipelineDeficit, currentPipelineCount, conversionRates]);

  useEffect(() => { fetchPaceData(); }, [fetchPaceData]);

  const handleCoachMe = async () => {
    if (!paceData) return;
    setCoachLoading(true);
    setCoachResponse(null);

    const pace = computePace(paceData);

    try {
      const { data, error } = await supabase.functions.invoke('coach-me', {
        body: {
          paceData: {
            ...paceData,
            gapDealsQ2: pace.gapDealsQ2,
            gapGciQ2: pace.gapGciQ2,
            gapDealsYear: pace.gapDealsYear,
            projectedQ2Deals: pace.projectedQ2Deals,
            projectedYearDeals: pace.projectedYearDeals,
            projectedYearGci: pace.projectedYearGci,
          },
        },
      });

      if (error) throw error;
      setCoachResponse(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Coach Mode failed', variant: 'destructive' });
    } finally {
      setCoachLoading(false);
    }
  };

  const handleApplyTargets = async () => {
    if (!coachResponse?.targets || !user?.id) return;
    setApplyingTargets(true);

    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + 7; // next Monday
    const nextMonday = new Date(now.getFullYear(), now.getMonth(), diff);
    const weekStart = nextMonday.toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('weekly_411')
      .select('id, calls_goal, appointments_goal, contracts_goal')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    const targets = coachResponse.targets;
    const payload = {
      calls_goal: targets.dials,
      appointments_goal: targets.appts,
      contracts_goal: targets.pipeline,
    };

    if (existing && (existing.calls_goal || existing.appointments_goal || existing.contracts_goal)) {
      const confirmed = window.confirm('Next week already has targets set. Overwrite with coach recommendations?');
      if (!confirmed) { setApplyingTargets(false); return; }
    }

    const { error } = existing
      ? await supabase.from('weekly_411').update(payload).eq('id', existing.id)
      : await supabase.from('weekly_411').insert({ user_id: user.id, week_start_date: weekStart, ...payload });

    setApplyingTargets(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to apply targets', variant: 'destructive' });
    } else {
      toast({ title: 'Applied!', description: 'Coach targets set for next week\'s 4-1-1.' });
    }
  };

  if (loading) return null;
  if (!paceData || (paceData.annualDealsGoal === 0 && paceData.annualGciGoal === 0 && paceData.q2ClosingsGoal === 0)) return null;

  const pace = computePace(paceData);
  const hasAnnualGoal = paceData.annualDealsGoal > 0 || paceData.annualGciGoal > 0;

  const cards = [
    {
      label: 'Projected Q2 Closings',
      projected: pace.projectedQ2Deals,
      goal: paceData.q2ClosingsGoal,
      gap: pace.gapDealsQ2,
      format: 'number' as const,
    },
    {
      label: 'Projected Q2 GCI',
      projected: pace.projectedQ2Gci,
      goal: paceData.q2GciTarget,
      gap: pace.gapGciQ2,
      format: 'currency' as const,
    },
    ...(hasAnnualGoal ? [
      {
        label: 'Projected Year-End Closings',
        projected: pace.projectedYearDeals,
        goal: paceData.annualDealsGoal,
        gap: pace.gapDealsYear,
        format: 'number' as const,
      },
      {
        label: 'Projected Year-End GCI',
        projected: pace.projectedYearGci,
        goal: paceData.annualGciGoal,
        gap: pace.gapGciYear,
        format: 'currency' as const,
      },
    ] : []),
  ];

  const fmt = (v: number, f: 'number' | 'currency') => f === 'currency' ? formatCurrency(v) : formatNumber(v);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-display">
          <TrendingUp className="h-5 w-5 text-primary" />
          Pace Tracker
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Day {pace.daysElapsed} of 365 · {pace.daysRemainingYear} remaining
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Based on your current pace YTD. Update your 4-1-1 to improve accuracy.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pace Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map(c => {
            const onTrack = c.gap <= 0;
            return (
              <div key={c.label} className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xl font-bold ${onTrack ? 'text-emerald-500' : 'text-destructive'}`}>
                    {fmt(c.projected, c.format)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {fmt(c.goal, c.format)}</span>
                </div>
                <Separator />
                <div className="flex items-center gap-1.5">
                  {onTrack ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <span className={`text-xs font-semibold ${onTrack ? 'text-emerald-500' : 'text-destructive'}`}>
                    {onTrack ? 'On track' : `Gap: ${fmt(Math.abs(c.gap), c.format)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Coach Mode */}
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold" />
              Coach Mode
            </h4>
            {!isReadOnly && (
              <Button
                size="sm"
                onClick={handleCoachMe}
                disabled={coachLoading}
                className="gap-2 bg-gold hover:bg-gold/90"
              >
                {coachLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {coachLoading ? 'Analyzing…' : 'Coach Me'}
              </Button>
            )}
          </div>

          {coachResponse && (
            <div className="rounded-lg border border-gold/20 bg-gold/5 p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">#1 Lever This Week</p>
                <p className="text-sm font-semibold text-foreground">{coachResponse.lever}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">3 Specific Actions</p>
                <ul className="space-y-1.5">
                  {coachResponse.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-gold shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Suggested Weekly Targets</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Dials', val: coachResponse.targets.dials },
                    { label: 'Contacts', val: coachResponse.targets.contacts },
                    { label: 'Appts', val: coachResponse.targets.appts },
                    { label: 'Pipeline', val: coachResponse.targets.pipeline },
                  ].map(t => (
                    <div key={t.label} className="rounded border border-border p-2">
                      <p className="text-xs text-muted-foreground">{t.label}</p>
                      <p className="text-lg font-bold text-foreground">{t.val}</p>
                    </div>
                  ))}
                </div>
              </div>
              {!isReadOnly && (
                <Button
                  size="sm"
                  onClick={handleApplyTargets}
                  disabled={applyingTargets}
                  variant="outline"
                  className="gap-2 border-gold/30 text-gold hover:bg-gold/10"
                >
                  <Send className="h-4 w-4" />
                  {applyingTargets ? 'Applying…' : 'Apply coach targets to my next 4-1-1'}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
