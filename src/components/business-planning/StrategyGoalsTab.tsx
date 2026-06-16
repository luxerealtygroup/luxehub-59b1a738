import React, { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Target, Brain, Zap, Save, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { ActiveMetrics, GoalInputs, AISuggestion, AIInsight, currentYear } from './types';
import { BreakdownRow } from './shared';
import { Q3Requirements } from './q3Requirements';
import {
  computeStrategy,
  validateCommissionRate,
  validateAvgSalePrice,
  validateClosingsGoal,
  AGENT_SPLIT,
  type StrategyInputs,
} from './strategyCalculations';

interface Props {
  metrics: ActiveMetrics | null;
  mode: 'active' | 'planning';
  goals: GoalInputs;
  setGoals: React.Dispatch<React.SetStateAction<GoalInputs>>;
  goalsId: string | null;
  setGoalsId: (id: string | null) => void;
  quarter: number;
  uid: string | null;
  isViewingAsAgent: boolean;
  effectiveRates: { contactToAppt: number; apptToContract: number; cmaToListing: number; dialsToAppt: number };
  prevQActualClosings: number;
  prevQGoalClosings: number;
  currentPipeline: number;
  /** Canonical Q-Pipeline Requirements — single source of truth, shared with PerformanceRealityTab */
  q3Requirements: Q3Requirements;
}

/* ── Locked display field ── */
const LockedField = ({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) => (
  <div className={`rounded-lg border p-3 ${highlight ? 'border-gold/30 bg-gold/5' : 'border-border bg-muted/30'}`}>
    <div className="mb-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
    <p className={`text-lg font-bold ${highlight ? 'text-gold' : 'text-foreground'}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

export function StrategyGoalsTab({
  metrics, mode, goals, setGoals, goalsId, setGoalsId,
  quarter, uid, isViewingAsAgent, effectiveRates,
  prevQActualClosings, prevQGoalClosings, currentPipeline, q3Requirements,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  // ── Derive commission rate as decimal ──
  // If agent entered avg_commission (gross $), derive rate from avg_sale_price
  // If goals have a rate-like value in avg_commission (legacy), treat it as gross $
  const commissionRateDecimal = useMemo(() => {
    if (goals.avg_sale_price > 0 && goals.avg_commission > 0 && goals.avg_commission < goals.avg_sale_price) {
      return goals.avg_commission / goals.avg_sale_price;
    }
    return null;
  }, [goals.avg_commission, goals.avg_sale_price]);

  // ── Strategy calculations (shared helper) ──
  // For active agents: auto-derive Q closings from annual target / 4
  const qClosingsGoal = useMemo(() => {
    if (goals.gci_target > 0 && goals.avg_commission > 0) {
      return Math.ceil(goals.gci_target / goals.avg_commission);
    }
    // Active mode fallback: derive from annual production goal
    if (mode === 'active' && metrics) {
      const annualTarget = metrics.targetGCI;
      const avgComm = metrics.avgCommission || 15000;
      if (annualTarget > 0) {
        return Math.ceil((annualTarget / avgComm) / 4); // quarterly
      }
    }
    return 0;
  }, [goals.gci_target, goals.avg_commission, mode, metrics]);

  const strategyInputs: StrategyInputs = {
    qClosingsGoal,
    avgSalePrice: goals.avg_sale_price,
    commissionRate: commissionRateDecimal,
    avgCommissionGross: goals.avg_commission > 0 ? goals.avg_commission : null,
    prevQActualClosings,
    prevQGoalClosings,
  };

  const strategy = computeStrategy(strategyInputs);

  // ── Validation ──
  const commRateError = commissionRateDecimal !== null ? validateCommissionRate(commissionRateDecimal) : null;
  const salePriceError = goals.avg_sale_price > 0 ? null : validateAvgSalePrice(goals.avg_sale_price);

  // ── Canonical Q-Requirements (sourced from PerformanceRealityTab's math) ──
  // Adjusted Pending Needed, Pipeline Required, Pipeline Gap, Avg GCI/Sale, and Q-GCI Target
  // ALL come from q3Requirements so the two tabs can never disagree.
  const requiredClosings = q3Requirements.q3SalesNeeded;
  const pipelineNeeded = q3Requirements.q3PipelineRequired;
  const pipelineGap = q3Requirements.q3PipelineGap;
  const requiredPipelineAdditions = pipelineGap;

  // ── Activity breakdown from adjusted closings ──
  const requiredListings = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredCMAs = effectiveRates.cmaToListing > 0 ? Math.ceil(requiredListings / (effectiveRates.cmaToListing / 100)) : 0;
  const requiredAppts = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredContacts = effectiveRates.contactToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.contactToAppt / 100)) : 0;
  const requiredDials = effectiveRates.dialsToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.dialsToAppt / 100)) : 0;

  const monthsInQ = 3;
  const weeksInQ = 13;
  const daysInQ = 65;
  const monthly = (v: number) => Math.ceil(v / monthsInQ);
  const weekly = (v: number) => Math.ceil(v / weeksInQ);
  const daily = (v: number) => Math.ceil(v / daysInQ);

  // ── Conversion rate sanity check ──
  const allRates = [
    { name: 'Contact → Appointment', val: effectiveRates.contactToAppt },
    { name: 'Appointment → Contract', val: effectiveRates.apptToContract },
    { name: 'CMA → Listing', val: effectiveRates.cmaToListing },
    { name: 'Dials → Appointment', val: effectiveRates.dialsToAppt },
    { name: 'Contact → Appointment (override)', val: goals.contact_to_appt_rate },
    { name: 'Appointment → Contract (override)', val: goals.appt_to_contract_rate },
    { name: 'CMA → Listing (override)', val: goals.cma_to_listing_rate },
    { name: 'Dials → Appointment (override)', val: goals.dials_to_appt_rate },
  ];
  const impossibleRates = allRates.filter(r => r.val > 100);
  const hasImpossibleRate = impossibleRates.length > 0;

  const saveGoals = async () => {
    if (!uid || isViewingAsAgent) return;
    setSaving(true);
    const payload = { ...goals, user_id: uid, year: currentYear, quarter };
    if (goalsId) {
      await supabase.from('planning_assumptions').update(payload).eq('id', goalsId);
    } else {
      const { data } = await supabase.from('planning_assumptions').insert(payload).select('id').single();
      if (data) setGoalsId(data.id);
    }
    toast({ title: 'Goals saved' });
    setSaving(false);
  };

  // ── AI Suggestions ──
  const generateAISuggestions = async () => {
    if (!metrics) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('business-planning-ai', {
        body: {
          metrics: {
            ytdClosedDeals: metrics.ytdClosedDeals, ytdGCI: metrics.ytdGCI,
            pendingGCI: metrics.pendingGCI, avgCommission: metrics.avgCommission,
            cmaToListingPct: metrics.cmaToListingPct, apptToContractPct: metrics.apptToContractPct,
            contactToApptPct: metrics.contactToApptPct, dialsToApptPct: metrics.dialsToApptPct,
            weeklyAvgDials: metrics.weeklyAvgDials, weeklyAvgContacts: metrics.weeklyAvgContacts,
            weeklyAvgAppts: metrics.weeklyAvgAppts, weeklyAvgCMAs: metrics.weeklyAvgCMAs,
            pendingDeals: metrics.pendingDeals, activeListings: metrics.activeListings,
            targetGCI: metrics.targetGCI, projectedYearEndGCI: metrics.projectedYearEndGCI,
          },
          quarter,
        },
      });
      if (error) throw error;
      if (data?.suggestions) setAiSuggestions(data.suggestions);
      if (data?.insights) setAiInsights(data.insights);
    } catch {
      toast({ title: 'Could not generate AI suggestions', variant: 'destructive' });
      generateLocalSuggestions();
    }
    setAiLoading(false);
  };

  const generateLocalSuggestions = () => {
    if (!metrics) return;
    const m = metrics;
    const avgC = m.avgCommission || 15000;
    const wks = 13;
    const buildSuggestion = (label: string, closings: number): AISuggestion => {
      const appts = effectiveRates.apptToContract > 0 ? Math.ceil(closings / (effectiveRates.apptToContract / 100)) : closings * 4;
      const contacts = effectiveRates.contactToAppt > 0 ? Math.ceil(appts / (effectiveRates.contactToAppt / 100)) : appts * 5;
      const dials = effectiveRates.dialsToAppt > 0 ? Math.ceil(appts / (effectiveRates.dialsToAppt / 100)) : appts * 10;
      const cmas = effectiveRates.cmaToListing > 0 ? Math.ceil(closings / (effectiveRates.cmaToListing / 100)) : closings * 3;
      return { label, closings, gci: closings * avgC, weeklyDials: Math.ceil(dials / wks), weeklyContacts: Math.ceil(contacts / wks), weeklyAppts: Math.ceil(appts / wks), weeklyCMAs: Math.ceil(cmas / wks) };
    };
    setAiSuggestions([
      buildSuggestion('Conservative', Math.max(Math.round(m.ytdClosedDeals * 0.25), 2)),
      buildSuggestion('Realistic', Math.max(Math.round(m.ytdClosedDeals * 0.35), 4)),
      buildSuggestion('Aggressive', Math.max(Math.round(m.ytdClosedDeals * 0.5), 6)),
    ]);
    const insights: AIInsight[] = [];
    const rates = [
      { name: 'Contact → Appointment', val: m.contactToApptPct },
      { name: 'Appointment → Contract', val: m.apptToContractPct },
      { name: 'CMA → Listing', val: m.cmaToListingPct },
      { name: 'Dials → Appointment', val: m.dialsToApptPct },
    ];
    const weakest = rates.reduce((a, b) => (a.val < b.val ? a : b));
    insights.push({ text: `Your bottleneck is ${weakest.name} at ${weakest.val}%.`, type: 'warning' });
    if (m.gapToTarget > 0) {
      insights.push({ text: `At current pace, you will miss your annual target by ${formatCurrency(m.gapToTarget)}.`, type: 'warning' });
    }
    setAiInsights(insights);
  };

  const acceptSuggestion = (idx: number) => {
    const s = aiSuggestions[idx];
    if (!s) return;
    setSelectedSuggestion(idx);
    setGoals(g => ({ ...g, gci_target: s.gci }));
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-gold" />
            Q{quarter} Strategy & Goals
          </CardTitle>
          {!isViewingAsAgent && (
            <Button size="sm" onClick={saveGoals} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">Save</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Editable Goal Inputs (planning mode only) ── */}
        {mode === 'planning' && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Goal Inputs</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Q{quarter} Pending Goal (Deals)</Label>
              <Input
                type="number"
                min={0}
                value={qClosingsGoal || ''}
                onChange={e => {
                  const deals = Number(e.target.value) || 0;
                  setGoals(g => ({ ...g, gci_target: deals * g.avg_commission }));
                  setSelectedSuggestion(null);
                }}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
              {validateClosingsGoal(qClosingsGoal) && (
                <p className="text-xs text-destructive mt-1">{validateClosingsGoal(qClosingsGoal)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Avg Sale Price</Label>
              <Input
                type="number"
                min={0}
                value={goals.avg_sale_price || ''}
                onChange={e => setGoals(g => ({ ...g, avg_sale_price: Number(e.target.value) }))}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
              {salePriceError && <p className="text-xs text-destructive mt-1">{salePriceError}</p>}
            </div>
            <div>
              <Label className="text-xs">Avg Commission / Deal (Gross $)</Label>
              <Input
                type="number"
                min={0}
                value={goals.avg_commission || ''}
                onChange={e => {
                  const comm = Number(e.target.value);
                  setGoals(g => ({ ...g, avg_commission: comm, gci_target: qClosingsGoal * comm }));
                }}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
              {commRateError && <p className="text-xs text-destructive mt-1">{commRateError}</p>}
              {commissionRateDecimal !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Implied rate: {(commissionRateDecimal * 100).toFixed(2)}% · Agent split: {(AGENT_SPLIT * 100).toFixed(0)}%
                </p>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── Q-Strategy Calculated Fields (locked) ── */}
        <Separator />
        <div>
          {hasImpossibleRate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3 flex items-start gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs font-medium">
                One or more conversion rates exceed 100% ({impossibleRates.map(r => r.name).join(', ')}).
                The data may be incorrect — please review your inputs.
              </p>
            </div>
          )}
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Q{quarter} Strategy — Auto-Calculated
          </h3>

          {/* Dominant KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg border-2 border-gold/40 bg-gold/5 p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Adjusted Pending Needed</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{requiredClosings}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sales to close in Q{quarter} (synced from Performance Reality)
              </p>
            </div>
            <div className={`rounded-lg border-2 p-5 ${pipelineGap > 0 ? 'border-gold/40 bg-gold/5' : 'border-green-300/40 bg-green-50/50'}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pipeline Gap</p>
              <p className={`text-3xl font-bold tabular-nums ${pipelineGap > 0 ? 'text-foreground' : 'text-green-700'}`}>{pipelineGap}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {pipelineGap > 0 ? `Need ${pipelineGap} more people in pipeline` : 'On track'}
              </p>
            </div>
          </div>

          {/* Supporting calculations */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <LockedField
              label={`Q${quarter > 1 ? quarter - 1 : 4} Gap (Deals)`}
              value={String(strategy.prevQGap)}
              sub={`${prevQActualClosings} pending of ${prevQGoalClosings} goal`}
              highlight={strategy.prevQGap > 0}
            />
            <LockedField
              label={`Q${quarter} Base Goal`}
              value={String(strategy.qBaseGoal)}
              sub="Before carryover"
            />
            <LockedField
              label="Avg GCI/Sale (Net)"
              value={formatCurrency(q3Requirements.avgGciPerSaleNet)}
              sub={q3Requirements.netLabel}
              highlight
            />
            <LockedField
              label="Avg GCI/Deal (Gross)"
              value={formatCurrency(Math.round(strategy.avgGciPerDeal))}
              sub="Team total — context only"
            />
            <LockedField
              label={`Q${quarter} GCI Target (Gross)`}
              value={formatCurrency(Math.round(strategy.qGciGross))}
              sub="Team total — context only"
            />
            <LockedField
              label={`Your Q${quarter} Net GCI Target`}
              value={formatCurrency(q3Requirements.adjustedQ3TargetNet)}
              sub={`${q3Requirements.netLabel} — this is your number`}
              highlight
            />
            <LockedField
              label="Pipeline Required"
              value={String(pipelineNeeded)}
              sub={`${q3Requirements.q3CurrentPipeline} current · 70% fallout rate`}
            />
          </div>
        </div>

        {/* ── Conversion Rates (read-only from Performance) ── */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            Conversion Rates (from Performance)
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            <span>Contact → Appt: <strong>{effectiveRates.contactToAppt}%</strong></span>
            <span>Appt → Contract: <strong>{effectiveRates.apptToContract}%</strong></span>
            <span>CMA → Listing: <strong>{effectiveRates.cmaToListing}%</strong></span>
            <span>Dials → Appt: <strong>{effectiveRates.dialsToAppt}%</strong></span>
          </div>
        </div>

        {/* ── Activity Breakdown ── */}
        {strategy.adjustedClosings > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Required Activity Breakdown</h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-4 gap-4 py-2 px-3 bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Metric</span><span className="text-center">Monthly</span><span className="text-center">Weekly</span><span className="text-center">Daily</span>
                </div>
                <BreakdownRow label="Pending" monthly={monthly(requiredClosings)} weekly={weekly(requiredClosings)} daily={daily(requiredClosings)} />
                <BreakdownRow label="Pipeline Additions" monthly={monthly(requiredPipelineAdditions)} weekly={weekly(requiredPipelineAdditions)} daily={daily(requiredPipelineAdditions)} />
                <BreakdownRow label="Listings" monthly={monthly(requiredListings)} weekly={weekly(requiredListings)} daily={daily(requiredListings)} />
                <BreakdownRow label="CMAs" monthly={monthly(requiredCMAs)} weekly={weekly(requiredCMAs)} daily={daily(requiredCMAs)} />
                <BreakdownRow label="Appointments" monthly={monthly(requiredAppts)} weekly={weekly(requiredAppts)} daily={daily(requiredAppts)} />
                <BreakdownRow label="Contacts" monthly={monthly(requiredContacts)} weekly={weekly(requiredContacts)} daily={daily(requiredContacts)} />
                <BreakdownRow label="Dials" monthly={monthly(requiredDials)} weekly={weekly(requiredDials)} daily={daily(requiredDials)} />
              </div>
            </div>
          </>
        )}

        {/* ── Planning mode: editable conversion rates ── */}
        {mode === 'planning' && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Manual Conversion Rate Overrides</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  { key: 'contact_to_appt_rate', label: 'Contact → Appt %' },
                  { key: 'appt_to_contract_rate', label: 'Appt → Contract %' },
                  { key: 'cma_to_listing_rate', label: 'CMA → Listing %' },
                  { key: 'dials_to_appt_rate', label: 'Dials → Appt %' },
                ] as const).map(f => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      value={goals[f.key] || ''}
                      onChange={e => setGoals(g => ({ ...g, [f.key]: Number(e.target.value) }))}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── AI Suggestions (Active Only) ── */}
        {mode === 'active' && metrics && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Brain className="h-4 w-4" /> AI-Suggested Q{quarter} Targets
                </h3>
                <Button size="sm" variant="outline" onClick={generateAISuggestions} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  <span className="ml-1">Generate</span>
                </Button>
              </div>

              {aiSuggestions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  {aiSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-4 cursor-pointer transition-all ${selectedSuggestion === i ? 'border-gold bg-gold/10 ring-1 ring-gold' : 'border-border bg-card hover:border-gold/50'}`}
                      onClick={() => acceptSuggestion(i)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-foreground">{s.label}</span>
                        <span className="text-lg font-bold text-gold">{formatCurrency(s.gci)}</span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{s.closings} pending required</p>
                        <p>{s.weeklyDials} dials/wk · {s.weeklyContacts} contacts/wk</p>
                        <p>{s.weeklyAppts} appts/wk · {s.weeklyCMAs} CMAs/wk</p>
                      </div>
                      {selectedSuggestion === i && <Badge className="mt-2 bg-gold text-gold-foreground text-xs">Selected</Badge>}
                    </div>
                  ))}
                </div>
              )}

              {aiInsights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tactical Insights</h4>
                  {aiInsights.map((insight, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${insight.type === 'warning' ? 'bg-destructive/5 border border-destructive/20 text-destructive' : insight.type === 'action' ? 'bg-gold/5 border border-gold/20 text-foreground' : 'bg-muted/50 border border-border text-foreground'}`}>
                      {insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-gold" />}
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <Separator />
        <p className="text-[11px] text-muted-foreground italic text-center pt-1">
          All figures synced from Performance Reality calculations.
        </p>
      </CardContent>
    </Card>
  );
}
