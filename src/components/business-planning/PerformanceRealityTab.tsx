import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PipelineDebug } from '@/hooks/usePipelineMetrics';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, Pencil, AlertTriangle, CheckCircle, TrendingUp, Info, ChevronDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { ActiveMetrics, ActiveListingDebug, GoalInputs, currentYear, safe } from './types';
import { StatCard } from './shared';
import { toast } from 'sonner';
import { formatWeightedDeals } from '@/lib/utils/dealWeight';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ── Pipeline data from shared usePipelineMetrics hook (same source as Pipeline tab) ──
export interface PipelineGapData {
  /** Pipeline clients in Q(n-1)+Q(n) date range — from pipeline_clients table */
  pipelineTotal: number;
  /** Total pipeline clients (no date filter) */
  pipelineTotalAll: number;
  /** Clients missing expected_pending_date */
  missingDateCount: number;
  /** Debug info from shared hook */
  pipelineDebug: PipelineDebug;
  /** Q(n-1) actual closings from FUB */
  prevQActualClosings: number;
  /** Q(n-1) required closings (goal-based) */
  prevQRequiredClosings: number;
  /** Q1 closed GCI YTD */
  q1ClosedGci?: number;
  /** Q2 closed GCI YTD */
  q2ClosedGci?: number;
  /** Firm pending GCI (under contract / pending stages — not conditional) */
  firmPendingGci?: number;
  /** Conditional GCI (offer / conditional stages) */
  conditionalGci?: number;
  /** Q1 closed deal count */
  q1ClosedUnits?: number;
  /** Q2 closed deal count */
  q2ClosedUnits?: number;
  /** Firm pending deal count */
  firmPendingUnits?: number;
  /** Conditional deal count */
  conditionalUnits?: number;
}

interface ManualPerformance {
  closed_deals: number;
  pending_deals: number;
  gci_closed: number;
  gci_pending: number;
  total_volume: number;
  pipeline_count: number;
  database_size: number;
}

const defaultManual: ManualPerformance = {
  closed_deals: 0, pending_deals: 0, gci_closed: 0,
  gci_pending: 0, total_volume: 0, pipeline_count: 0, database_size: 0,
};

interface Props {
  metrics: ActiveMetrics | null;
  mode: 'active' | 'planning';
  dateRange: string;
  customStart: string;
  customEnd: string;
  isAdmin: boolean;
  debugInfo: DebugInfo | null;
  activeListingDebug: ActiveListingDebug;
  goals: GoalInputs;
  effectiveRates: { contactToAppt: number; apptToContract: number; cmaToListing: number; dialsToAppt: number };
  uid: string | null;
  quarter: number;
  pipelineGapData: PipelineGapData;
  onManualMetrics?: (m: ManualPerformance) => void;
}

function ManualPerformanceForm({ uid, onSaved }: { uid: string | null; onSaved: (m: ManualPerformance) => void }) {
  const [form, setForm] = useState<ManualPerformance>(defaultManual);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    if (!uid) return;
    supabase.from('manual_production')
      .select('*')
      .eq('user_id', uid)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = {
            closed_deals: safe(data.closed_deals),
            pending_deals: safe(data.pending_deals),
            gci_closed: safe(data.gci_closed),
            gci_pending: safe(data.gci_pending),
            total_volume: safe(data.total_volume),
            pipeline_count: safe(data.pipeline_count),
            database_size: safe(data.database_size),
          };
          setForm(d);
          onSaved(d);
        }
        setLoaded(true);
      });
  }, [uid]);

  const handleSave = async () => {
    if (!uid) return;
    setSaving(true);
    const payload = { user_id: uid, year: currentYear, month: currentMonth, ...form };
    const { data: existing } = await supabase.from('manual_production')
      .select('id').eq('user_id', uid).eq('year', currentYear).eq('month', currentMonth).maybeSingle();
    
    const { error } = existing
      ? await supabase.from('manual_production').update(form).eq('id', existing.id)
      : await supabase.from('manual_production').insert(payload);

    setSaving(false);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Performance data saved');
    onSaved(form);
  };

  const set = (key: keyof ManualPerformance, val: string) => {
    setForm(f => ({ ...f, [key]: Number(val) || 0 }));
  };

  if (!loaded) return null;

  const fields: { key: keyof ManualPerformance; label: string; prefix?: string }[] = [
    { key: 'closed_deals', label: 'YTD Closed Deals' },
    { key: 'gci_closed', label: 'YTD GCI (Closed)', prefix: '$' },
    { key: 'pending_deals', label: 'Pending Deals' },
    { key: 'gci_pending', label: 'Pending GCI', prefix: '$' },
    { key: 'pipeline_count', label: 'Active Listings / Pipeline' },
    { key: 'total_volume', label: 'Total Volume', prefix: '$' },
    { key: 'database_size', label: 'Database Size' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(f => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            <div className="relative">
              {f.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.prefix}</span>}
              <Input
                type="number"
                value={form[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                className={f.prefix ? 'pl-7' : ''}
              />
            </div>
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
        <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Performance Data'}
      </Button>
    </div>
  );
}

// ── Default fallout rate ──
const DEFAULT_FALLOUT_RATE = 0.70;

function Step({
  label, value, sub, bold, muted, amber, danger, success,
}: {
  label: string; value: string; sub?: string;
  bold?: boolean; muted?: boolean; amber?: boolean; danger?: boolean; success?: boolean;
}) {
  const valueColor = danger
    ? 'text-destructive'
    : success
      ? 'text-green-600'
      : amber
        ? 'text-amber-600'
        : 'text-foreground';
  const labelColor = muted ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${labelColor}`}>{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <p className={`text-base ${bold ? 'font-bold' : 'font-semibold'} ${valueColor} tabular-nums whitespace-nowrap`}>
        {value}
      </p>
    </div>
  );
}

export function PerformanceRealityTab({
  metrics, mode, dateRange, customStart, customEnd,
  isAdmin, debugInfo, activeListingDebug, goals, effectiveRates, uid, quarter, pipelineGapData, onManualMetrics,
}: Props) {
  const rangeLabel = dateRange === 'ytd' ? 'YTD' : dateRange === 'custom' ? `${customStart} → ${customEnd}` : dateRange.toUpperCase();

  // ── Pipeline Deficit Analysis with Q(n-1) carryover ──
  const qTargetGCI = goals.gci_target > 0
    ? goals.gci_target
    : (metrics?.targetGCI && metrics.targetGCI > 0 ? Math.round(metrics.targetGCI / 4) : 0);
  const avgGCIPerDeal = metrics?.avgCommission && metrics.avgCommission > 0
    ? metrics.avgCommission
    : (goals.avg_commission > 0 ? goals.avg_commission : 0);

  const hasTarget = qTargetGCI > 0 && avgGCIPerDeal > 0;
  const q2BaseGoal = hasTarget ? Math.ceil(qTargetGCI / avgGCIPerDeal) : 0;

  // Carryover: shortfall from previous quarter
  const prevQGap = Math.max(0, pipelineGapData.prevQRequiredClosings - pipelineGapData.prevQActualClosings);
  const adjustedClosingsGoal = q2BaseGoal + prevQGap;

  const falloutRate = DEFAULT_FALLOUT_RATE;
  const conversionFactor = 1 - falloutRate; // 0.30
  const requiredPipelineDeals = hasTarget ? Math.ceil(adjustedClosingsGoal / conversionFactor) : 0;
  const currentPipelineDeals = pipelineGapData.pipelineTotal;
  const pipelineDeficit = hasTarget ? Math.max(0, requiredPipelineDeals - currentPipelineDeals) : null;
  const pipelineSurplus = hasTarget ? Math.max(0, currentPipelineDeals - requiredPipelineDeals) : 0;
  const missingDateCount = pipelineGapData.missingDateCount;

  const prevQ = quarter > 1 ? quarter - 1 : 4;

  // ── Forward-looking outlook: pending + conditional vs annual goal ──
  const annualGoal = metrics?.targetGCI || 0;
  const ytdClosedGci = metrics?.ytdGCI || 0;
  const q1Gci = pipelineGapData.q1ClosedGci || 0;
  const q2Gci = pipelineGapData.q2ClosedGci || 0;
  const firmPendingGci = pipelineGapData.firmPendingGci || 0;
  const conditionalGci = pipelineGapData.conditionalGci || 0;
  const q1Units = pipelineGapData.q1ClosedUnits || 0;
  const q2Units = pipelineGapData.q2ClosedUnits || 0;
  const firmPendingUnits = pipelineGapData.firmPendingUnits || 0;
  const conditionalUnits = pipelineGapData.conditionalUnits || 0;
  // Projected = banked YTD + firm pending (likely to close) + conditional (at-risk upside)
  const projectedGci = ytdClosedGci + firmPendingGci + conditionalGci;
  const projectedUnits = (metrics?.ytdClosedDeals || 0) + firmPendingUnits + conditionalUnits;
  const projectedVsGoal = annualGoal > 0 ? projectedGci - annualGoal : 0;
  const projectedPct = annualGoal > 0 ? Math.min(100, Math.round((projectedGci / annualGoal) * 100)) : 0;
  const weeksToCloseDeficit = pipelineDeficit && pipelineDeficit > 0 ? Math.ceil(pipelineDeficit / 3) : 0;

  // ── Mid-Year Review math (Q3 Accountability) ──
  const expectedMidyear = annualGoal > 0 ? annualGoal / 2 : 0;
  const conditionalAt99 = conditionalGci * 0.99;
  const projectedH1Actual = ytdClosedGci + firmPendingGci + conditionalAt99;
  const midyearGap = expectedMidyear - projectedH1Actual; // positive = behind
  const isBehind = midyearGap > 0;
  const remainingGoal = Math.max(0, annualGoal - projectedH1Actual);
  const h1Carryover = isBehind ? midyearGap : 0;
  // Q3/Q4 split of remaining goal — Q3 historically outperforms Q4
  const Q3_SHARE = 0.60;
  const Q4_SHARE = 0.40;
  const q3ShareOfRemaining = remainingGoal * Q3_SHARE;
  const q4ShareOfRemaining = remainingGoal * Q4_SHARE;
  const q3CarryoverShare = h1Carryover * Q3_SHARE;
  const adjustedQ3Target = q3ShareOfRemaining + q3CarryoverShare;
  const originalQ3Goal = annualGoal > 0 ? annualGoal / 4 : 0;
  const surplus = !isBehind ? Math.abs(midyearGap) : 0;
  // Progress bar geometry
  const midyearTickPct = annualGoal > 0 ? 50 : 0;
  const actualPct = annualGoal > 0 ? Math.max(0, Math.min(100, (projectedH1Actual / annualGoal) * 100)) : 0;
  // ── Q3 Pipeline requirement — sale vs lease honest math ──
  const TEAM_AVG_GCI_FALLBACK = 15000;
  const MIN_DEALS_FOR_PERSONAL_AVG = 3;
  const salesClosed = metrics?.salesCountClosed || 0;
  const leasesClosed = metrics?.leaseCountClosed || 0;
  const gciSales = (metrics as any)?.avgGciPerSale ? metrics!.avgGciPerSale * salesClosed : 0;
  const gciLeases = (metrics as any)?.avgGciPerLease ? metrics!.avgGciPerLease * leasesClosed : 0;
  const totalSplitGci = gciSales + gciLeases;
  // Personal vs team-average sale GCI
  const usingPersonalSaleAvg = salesClosed >= MIN_DEALS_FOR_PERSONAL_AVG && (metrics?.avgGciPerSale || 0) > 0;
  const avgGciPerSale = usingPersonalSaleAvg ? metrics!.avgGciPerSale : TEAM_AVG_GCI_FALLBACK;
  const usingPersonalLeaseAvg = leasesClosed >= MIN_DEALS_FOR_PERSONAL_AVG && (metrics?.avgGciPerLease || 0) > 0;
  const avgGciPerLease = usingPersonalLeaseAvg ? metrics!.avgGciPerLease : 0;
  const hasLeaseMix = leasesClosed > 0 && avgGciPerLease > 0 && totalSplitGci > 0;
  // Split Q3 GCI target the same way agent historically earns it (by GCI share)
  const saleGciShare = hasLeaseMix && totalSplitGci > 0 ? gciSales / totalSplitGci : 1;
  const leaseGciShare = hasLeaseMix ? 1 - saleGciShare : 0;
  const q3SalesGciTarget = adjustedQ3Target * saleGciShare;
  const q3LeasesGciTarget = adjustedQ3Target * leaseGciShare;
  const q3SalesNeeded = avgGciPerSale > 0 ? Math.ceil(q3SalesGciTarget / avgGciPerSale) : 0;
  const q3LeasesNeeded = hasLeaseMix && avgGciPerLease > 0 ? Math.ceil(q3LeasesGciTarget / avgGciPerLease) : 0;
  const q3ClosingsNeeded = q3SalesNeeded + q3LeasesNeeded;
  const q3PipelineRequired = q3ClosingsNeeded > 0 ? Math.ceil(q3ClosingsNeeded / 0.30) : 0;
  const q3CurrentPipeline = currentPipelineDeals;
  const q3PipelineGap = Math.max(0, q3PipelineRequired - q3CurrentPipeline);
  const weeklyNewContacts = q3PipelineGap > 0 ? Math.ceil(q3PipelineGap / 13) : 0;
  // Sense-check: Q3 deals needed should not exceed full-year deal goal
  const annualDealGoal = avgGciPerSale > 0 && annualGoal > 0 ? Math.ceil(annualGoal / avgGciPerSale) : 0;
  const q3DealCountUnreasonable = annualDealGoal > 0 && q3ClosingsNeeded > annualDealGoal;

  // ── Activity Pace (Section 1b) ──
  const now = new Date();
  const yearStart = new Date(currentYear, 0, 1);
  const weeksElapsed = Math.max(1, Math.floor((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24 * 7)));
  const totalWeeksInYear = 52;
  type ActivityRow = {
    key: string; label: string; weeklyTarget: number; actual: number;
  };
  const activityRows: ActivityRow[] = metrics ? [
    { key: 'conversations', label: 'Conversations',  weeklyTarget: 10, actual: metrics.totalContacts },
    { key: 'pipeline',      label: 'Pipeline Adds',  weeklyTarget: 3,  actual: metrics.totalPipelineAdditions },
    { key: 'appts',         label: 'Appointments',   weeklyTarget: 1,  actual: metrics.totalAppts },
    { key: 'listings',      label: 'Listings Taken', weeklyTarget: 0.5, actual: metrics.totalListings },
    { key: 'offers',        label: 'Offers Written', weeklyTarget: 0.5, actual: metrics.totalContracts },
  ] : [];
  const activityComputed = activityRows.map(r => {
    const expected = Math.round(r.weeklyTarget * weeksElapsed);
    const pace = expected > 0 ? r.actual / expected : 1;
    const status: 'green' | 'amber' | 'red' = pace >= 1 ? 'green' : pace >= 0.8 ? 'amber' : 'red';
    const fillPct = expected > 0 ? Math.min(100, Math.round((r.actual / expected) * 100)) : 0;
    const weeklyActual = r.actual / weeksElapsed;
    const projectedAnnual = Math.round(weeklyActual * totalWeeksInYear);
    const requiredAnnual = Math.round(r.weeklyTarget * totalWeeksInYear);
    const shortfallPct = expected > 0 ? Math.max(0, 1 - pace) : 0;
    return { ...r, expected, pace, status, fillPct, weeklyActual, projectedAnnual, requiredAnnual, shortfallPct };
  });
  const worstActivity = activityComputed.length
    ? activityComputed.reduce((a, b) => (b.shortfallPct > a.shortfallPct ? b : a))
    : null;

  // Manual metrics state for planning mode display
  const [manualData, setManualData] = useState<ManualPerformance | null>(null);

  const handleManualSaved = useCallback((m: ManualPerformance) => {
    setManualData(m);
    onManualMetrics?.(m);
  }, [onManualMetrics]);

  return (
    <div className="space-y-6">
      <DebugMetricsPanel debugInfo={debugInfo} isAdmin={isAdmin} />

      {mode === 'active' && metrics ? (
        <>
        {annualGoal > 0 && avgGCIPerDeal > 0 && (
          <Card className="border-2 border-foreground/20 bg-muted/30 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                Mid-Year Review — Q3 Accountability Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* ── Section 1: Annual Snapshot ── */}
              <div className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Midyear Scorecard — GCI + Activity</p>
                  <p className="text-[11px] text-muted-foreground">Halfway through {currentYear}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Annual GCI Goal</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(annualGoal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Where you should be by now</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(expectedMidyear)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">On track to earn Jan–Jun</p>
                    <p className={`text-xl font-bold tabular-nums ${isBehind ? 'text-amber-600' : 'text-green-600'}`}>
                      {formatCurrency(projectedH1Actual)}
                    </p>
                  </div>
                </div>

                {/* Progress bar: filled = actual, tick = midyear, end = annual goal */}
                <div className="relative pt-6 pb-2">
                  <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden">
                    {/* Filled actual */}
                    <div
                      className={`h-full ${isBehind ? 'bg-foreground/70' : 'bg-green-600'} transition-all`}
                      style={{ width: `${actualPct}%` }}
                    />
                    {/* Amber shading from actual → midyear when behind */}
                    {isBehind && actualPct < midyearTickPct && (
                      <div
                        className="absolute top-0 h-full bg-amber-500/40"
                        style={{ left: `${actualPct}%`, width: `${midyearTickPct - actualPct}%` }}
                      />
                    )}
                    {/* Midyear tick */}
                    <div
                      className="absolute top-[-4px] h-5 w-0.5 bg-foreground"
                      style={{ left: `${midyearTickPct}%` }}
                    />
                  </div>
                  <div className="relative mt-1 text-[10px] text-muted-foreground">
                    <span className="absolute left-0">$0</span>
                    <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Midyear</span>
                    <span className="absolute right-0">{formatCurrency(annualGoal)}</span>
                  </div>
                </div>

                <p className={`text-sm font-medium ${isBehind ? 'text-amber-700 dark:text-amber-500' : 'text-green-700 dark:text-green-500'} pt-2`}>
                  {isBehind
                    ? `You are ${formatCurrency(Math.abs(midyearGap))} behind midyear pace. That gap rolls into Q3.`
                    : `You are ${formatCurrency(Math.abs(midyearGap))} ahead of midyear pace — Q3 is about maintaining momentum.`}
                </p>

                {/* ── Activity Pace sub-section ── */}
                {activityComputed.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Activity Pace</p>
                    <div className="space-y-2">
                      {activityComputed.map(a => {
                        const dot = a.status === 'green' ? 'bg-green-500' : a.status === 'amber' ? 'bg-amber-500' : 'bg-red-500';
                        const fill = a.status === 'green' ? 'bg-green-500' : a.status === 'amber' ? 'bg-amber-500' : 'bg-red-500';
                        return (
                          <div key={a.key} className="grid grid-cols-[110px_1fr_auto_auto] items-center gap-3 text-[12px]">
                            <span className="text-muted-foreground">{a.label}</span>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
                              <div className={`h-full ${fill} transition-all`} style={{ width: `${a.fillPct}%` }} />
                              <div className="absolute top-[-2px] h-[10px] w-0.5 bg-foreground/60" style={{ left: '100%', transform: 'translateX(-1px)' }} />
                            </div>
                            <span className="tabular-nums text-foreground whitespace-nowrap">
                              {formatNumber(a.actual)} of {formatNumber(a.expected)}
                            </span>
                            <span className="tabular-nums text-muted-foreground whitespace-nowrap flex items-center gap-2">
                              {a.weeklyActual.toFixed(1)}/wk vs {a.weeklyTarget}/wk
                              <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-label={a.status} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {worstActivity && worstActivity.shortfallPct > 0 && (
                      <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                        <p className="text-[12px] text-foreground leading-relaxed">
                          Your biggest activity gap is <span className="font-semibold">{worstActivity.label.toLowerCase()}</span>. At your current pace, you will finish the year with <span className="font-semibold tabular-nums">{formatNumber(worstActivity.projectedAnnual)}</span> — <span className="font-semibold tabular-nums">{formatNumber(Math.max(0, worstActivity.requiredAnnual - worstActivity.projectedAnnual))}</span> short of what the math requires to hit your GCI goal.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* ── Section 2: Q3 Adjusted Target ── */}
              <div className="space-y-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Q3 Adjusted Target</p>

                <div className="rounded-lg border border-border bg-background p-5 space-y-3">
                   <Step label="Annual GCI Goal" value={formatCurrency(annualGoal)} muted />
                   <Step label="− What you're on track to earn Jan–Jun" value={`− ${formatCurrency(projectedH1Actual)}`} muted />
                   <div className="border-t border-dashed border-border pt-3">
                     <Step label="= What's left to earn Jul–Dec" value={formatCurrency(remainingGoal)} />
                   </div>
                   <Step label="Q3 share (60% of remaining)" value={formatCurrency(q3ShareOfRemaining)} muted />
                   <Step
                     label="+ Extra added because you're behind pace"
                     sub={isBehind ? "60% of the H1 gap — Q4 carries the other 40%" : undefined}
                     value={`+ ${formatCurrency(q3CarryoverShare)}`}
                     muted={!isBehind}
                     amber={isBehind}
                   />
                   <div className="border-t-2 border-foreground/20 pt-4 flex items-baseline justify-between gap-4">
                     <p className="text-sm font-bold uppercase tracking-wider text-foreground">Adjusted Q3 Target</p>
                     <p className={`text-3xl font-bold tabular-nums ${isBehind ? 'text-foreground' : 'text-green-600'}`}>
                       {formatCurrency(adjustedQ3Target)}
                     </p>
                   </div>
                   <div className="border-t border-dashed border-border pt-3 flex items-baseline justify-between gap-4">
                     <p className="text-[12px] text-muted-foreground">Q4 target (projected) — Q4 planning opens October 1.</p>
                     <p className="text-sm font-semibold text-muted-foreground tabular-nums">{formatCurrency(q4ShareOfRemaining)}</p>
                   </div>
                 </div>

                 {isBehind ? (
                   <p className="text-[12px] text-muted-foreground">
                     Your original Q3 goal was <span className="font-semibold text-foreground">{formatCurrency(originalQ3Goal)}</span>. The remaining gap from H1 has been split across Q3 and Q4 based on how agents on this team typically produce. Q3 carries 60%, Q4 carries 40%.
                   </p>
                 ) : (
                   <p className="text-[12px] text-muted-foreground">
                     You banked <span className="font-semibold text-green-600">{formatCurrency(surplus)}</span> in H1. Your Q3 target is <span className="font-semibold text-foreground">{formatCurrency(adjustedQ3Target)}</span> — but don't coast.
                   </p>
                 )}
                 <p className="text-[11px] text-muted-foreground italic">
                   Q3/Q4 split based on typical team production patterns — Q3 historically outperforms Q4.
                 </p>
              </div>

              <Separator />

              {/* ── Section 3: Q3 Pipeline Requirement ── */}
              <div className="space-y-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Q3 Pipeline Requirement</p>

                <div className="rounded-lg border border-border bg-background p-5 space-y-3">
                  <Step label="Your Q3 GCI target" value={formatCurrency(adjustedQ3Target)} muted />
                  <div className="border-t border-dashed border-border pt-3">
                    <Step
                      label="Sales needed in Q3"
                      sub={`avg ${formatCurrency(avgGciPerSale)} per sale`}
                      value={`${formatNumber(q3SalesNeeded)} ${q3SalesNeeded === 1 ? 'sale' : 'sales'}`}
                    />
                    {hasLeaseMix && (
                      <div className="mt-3">
                        <Step
                          label="Leases needed in Q3"
                          sub={`avg ${formatCurrency(avgGciPerLease)} per lease`}
                          value={`${formatNumber(q3LeasesNeeded)} ${q3LeasesNeeded === 1 ? 'lease' : 'leases'}`}
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                      {usingPersonalSaleAvg
                        ? `Based on your ${formatNumber(salesClosed)} closed ${salesClosed === 1 ? 'sale' : 'sales'} this year${hasLeaseMix ? ` and ${formatNumber(leasesClosed)} ${leasesClosed === 1 ? 'lease' : 'leases'}` : ''}.`
                        : `Based on team average (not enough personal data yet — need ${MIN_DEALS_FOR_PERSONAL_AVG}+ closed sales).`}
                    </p>
                  </div>

                  {q3DealCountUnreasonable && (
                    <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[12px] text-foreground leading-snug">
                        This number looks high — it may mean your Q3 GCI target needs to be reviewed with Kristen, or your average deal size is being pulled down by leases. Leases are counted as ⅓ of a deal and significantly reduce your average.
                      </p>
                    </div>
                  )}

                  <div className="border-t border-dashed border-border pt-3">
                    <Step label="Total deals to close in Q3" value={`${formatNumber(q3ClosingsNeeded)} deals`} bold />
                  </div>
                  <Step label="÷ Your close rate (3 in 10)" sub="7 of 10 usually fall through" value="" muted />
                  <div className="border-t border-dashed border-border pt-3">
                    <Step label="Total pipeline required" value={`${formatNumber(q3PipelineRequired)} people`} />
                  </div>
                  <Step label="− Already in pipeline" value={`− ${formatNumber(q3CurrentPipeline)} people`} muted />
                  <div className="border-t-2 border-foreground/20 pt-4">
                    <Step
                      label="Still need to find"
                      value={`${formatNumber(q3PipelineGap)} more people to reach out to`}
                      bold
                      amber={q3PipelineGap > 0}
                      success={q3PipelineGap === 0}
                    />
                  </div>
                </div>

                {q3PipelineGap > 0 ? (
                  <div className="rounded-lg border-2 border-amber-500 bg-amber-500/10 p-5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700 dark:text-amber-500 font-bold mb-2">
                      Weekly Action — Next 13 Weeks
                    </p>
                    <p className="text-lg font-bold text-foreground leading-snug">
                      Add <span className="text-2xl text-amber-700 dark:text-amber-500">{weeklyNewContacts}</span> new people to your pipeline every week —
                      on top of the 3/week baseline.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-green-600 bg-green-500/10 p-5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-green-700 dark:text-green-500 font-bold mb-2">
                      You're All Set
                    </p>
                    <p className="text-base font-bold text-foreground leading-snug">
                      Your pipeline is deep enough to hit your Q3 target. Focus on execution and keep moving.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {annualGoal > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Q{quarter} Outlook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* History de-emphasized, pending/conditional dominant */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
                <div className="rounded-lg border border-dashed border-border/60 p-3 bg-muted/20">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Q1 GCI</p>
                  <p className="text-lg font-medium text-muted-foreground">{formatCurrency(q1Gci)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{q1Units} closed</p>
                </div>
                <div className="rounded-lg border border-dashed border-border/60 p-3 bg-muted/20">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Q2 GCI</p>
                  <p className="text-lg font-medium text-muted-foreground">{formatCurrency(q2Gci)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{q2Units} closed</p>
                </div>
                <div className="rounded-lg border-2 border-gold/40 bg-gold/5 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pending GCI</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(firmPendingGci)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{firmPendingUnits} under contract / pending</p>
                </div>
                <div className="rounded-lg border-2 border-gold/40 bg-gold/5 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Conditional GCI</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(conditionalGci)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{conditionalUnits} offer / conditional</p>
                </div>
              </div>

              {/* Progress with explicit label */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">% of annual goal already in pipeline</p>
                  <p className="text-sm font-bold text-foreground">{projectedPct}%</p>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gold transition-all" style={{ width: `${projectedPct}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Projected {formatCurrency(projectedGci)} of {formatCurrency(annualGoal)} annual goal
                </p>
              </div>

              {projectedVsGoal < 0 ? (
                <div className="rounded-lg border-l-4 border-amber-500 bg-amber-500/5 p-4">
                  <p className="text-sm font-bold text-foreground">
                    Current pipeline covers only {projectedPct}% of your annual goal.
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                    You need {formatCurrency(Math.abs(projectedVsGoal))} more in closings. Q{quarter} new pipeline is not optional.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border-l-4 border-green-600 bg-green-500/5 p-4">
                  <p className="text-sm font-bold text-foreground">
                    Pending + conditional puts you above annual goal.
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                    {formatCurrency(projectedVsGoal)} surplus — protect those deals through close.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Performance Reality
              </span>
              <Badge variant="outline" className="text-xs font-normal">{rangeLabel} {currentYear}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Snapshot bar — borderless horizontal row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{rangeLabel} Closed</p>
                <p className="text-3xl font-bold text-foreground leading-none">{formatWeightedDeals(metrics.weightedClosed)}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {metrics.weightedDebugClosed?.leaseCount ? `${metrics.ytdClosedDeals} raw · ${metrics.weightedDebugClosed.leaseCount} leases` : `${metrics.ytdClosedDeals} raw`}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{rangeLabel} GCI</p>
                <p className="text-3xl font-bold text-foreground leading-none">{formatCurrency(metrics.ytdGCI)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pending</p>
                <p className="text-3xl font-bold text-foreground leading-none">{formatWeightedDeals(metrics.weightedPending)}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {metrics.weightedDebugPending?.leaseCount ? `${metrics.pendingDeals} raw · ${metrics.weightedDebugPending.leaseCount} leases` : `${metrics.pendingDeals} raw`}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active Listings</p>
                <p className="text-3xl font-bold text-foreground leading-none">{formatNumber(metrics.activeListings)}</p>
              </div>
            </div>

            {/* Conversion rates — collapsed by default */}
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors">
                Conversion Rates
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="CMA → Listing" value={`${metrics.cmaToListingPct}%`} />
                  <StatCard label="Appt → Contract" value={`${metrics.apptToContractPct}%`} />
                  <StatCard label="Contact → Appt" value={`${metrics.contactToApptPct}%`} />
                  <StatCard label="Dials → Appt" value={`${metrics.dialsToApptPct}%`} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Hero numbers: Projected Year-End GCI + Gap */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border-2 border-gold/40 bg-gold/5 p-6 min-h-[160px] flex flex-col justify-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                  Projected Year-End GCI
                </p>
                <p className="text-4xl md:text-5xl font-bold text-foreground leading-none">
                  {formatCurrency(projectedGci)}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  YTD closed + pending + conditional
                  {metrics.targetGCI > 0 ? ` · Target: ${formatCurrency(metrics.targetGCI)}` : ''}
                </p>
              </div>
              {metrics.targetGCI > 0 && (
                <div className={`rounded-lg border-2 p-6 min-h-[160px] flex flex-col justify-center ${
                  projectedGci < metrics.targetGCI ? 'border-destructive/60' : 'border-green-600/60'
                }`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                    GCI Gap to Annual Goal
                  </p>
                  <p className={`text-4xl md:text-5xl font-bold leading-none ${
                    projectedGci < metrics.targetGCI ? 'text-destructive' : 'text-green-600'
                  }`}>
                    {projectedGci < metrics.targetGCI ? formatCurrency(metrics.targetGCI - projectedGci) : 'On Track'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {projectedGci < metrics.targetGCI ? 'Shortfall vs pipeline projection' : 'Projected to meet or exceed annual goal'}
                  </p>
                </div>
              )}
            </div>

            {/* Pipeline Deficit — distinct background */}
            <div className="rounded-xl bg-muted/40 dark:bg-muted/20 p-5 md:p-6 space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Pipeline Deficit Analysis
              </h3>

              {pipelineDeficit === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-600">
                    <Info className="h-4 w-4 inline mr-1" />
                    Set Q{quarter} Goal
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Set a GCI target in the Strategy &amp; Goals tab to enable pipeline deficit analysis.</p>
                </div>
              ) : (
                <>
                  {/* Inline contextual callout above the math */}
                  {pipelineDeficit > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                      <p className="text-sm text-foreground">
                        You need <span className="font-bold">{pipelineDeficit}</span> more pipeline contacts to hit your Q{quarter} goal.
                        At 3 adds/week, that's <span className="font-bold">{weeksToCloseDeficit} week{weeksToCloseDeficit === 1 ? '' : 's'}</span> of work.
                      </p>
                    </div>
                  )}

                  {/* Vertical step layout */}
                  <div className="rounded-lg border border-border bg-background p-5 space-y-3">
                    <Step label="Starting Point" value={`${formatNumber(q2BaseGoal)} deals`} sub={`Q${quarter} base closings goal`} />
                    {prevQGap > 0 && (
                      <Step
                        label="Add"
                        value={`+${prevQGap} deals`}
                        sub={`YTD deal gap through Q${prevQ} (carryover)`}
                        amber
                      />
                    )}
                    {prevQGap > 0 && (
                      <Step label="Adjusted Required" value={`${formatNumber(adjustedClosingsGoal)} deals`} bold />
                    )}
                    <Step
                      label="÷ Fallout Rate"
                      value={`${Math.round(conversionFactor * 100)}%`}
                      sub={`100% − ${Math.round(falloutRate * 100)}% fallout`}
                      muted
                    />
                    <Separator />
                    <Step label="Required Pipeline" value={`${formatNumber(requiredPipelineDeals)} deals`} bold />
                    <Step label="Current Pipeline" value={`${formatNumber(currentPipelineDeals)} deals`} sub={`Q${prevQ}+Q${quarter}`} />
                    {missingDateCount > 0 && (
                      <p className="text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {missingDateCount} client(s) missing expected pending date — not counted
                      </p>
                    )}
                    <Separator />
                    {pipelineDeficit > 0 ? (
                      <Step label="= Deficit" value={`${pipelineDeficit} deals short`} bold danger />
                    ) : pipelineSurplus > 0 ? (
                      <Step label="= Surplus" value={`+${pipelineSurplus} deals ahead`} bold success />
                    ) : (
                      <Step label="= Covered" value="Exactly on target" bold success />
                    )}
                  </div>

                  {/* Bottom callout — actionable conclusion */}
                  {pipelineDeficit > 0 ? (
                    <div className="rounded-lg border-2 border-amber-500 bg-amber-500/10 p-5 text-center">
                      <p className="text-[11px] uppercase tracking-[0.15em] text-amber-700 dark:text-amber-500 font-semibold mb-2">
                        Action Required
                      </p>
                      <p className="text-3xl md:text-4xl font-bold text-amber-700 dark:text-amber-400 leading-none">
                        {pipelineDeficit} more pipeline additions needed
                      </p>
                    </div>
                  ) : pipelineSurplus > 0 ? (
                    <div className="rounded-lg border-2 border-green-600 bg-green-500/10 p-5 text-center">
                      <p className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-400 leading-none">
                        +{pipelineSurplus} deals ahead of pipeline target
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-green-600 bg-green-500/10 p-5 text-center">
                      <p className="text-3xl md:text-4xl font-bold text-green-700 dark:text-green-400 leading-none">
                        Pipeline covered
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
        </>
      ) : (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Pencil className="h-5 w-5 text-gold" /> Performance Reality
              <Badge variant="outline" className="ml-2 text-xs font-normal">Manual Entry — {currentYear}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Enter your current production numbers manually. These will be used across your business plan.
            </p>
            <ManualPerformanceForm uid={uid} onSaved={handleManualSaved} />

            {manualData && manualData.gci_closed > 0 && (
              <>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="YTD Closed Deals" value={formatNumber(manualData.closed_deals)} />
                  <StatCard label="YTD GCI" value={formatCurrency(manualData.gci_closed)} />
                  <StatCard label="Pending GCI" value={formatCurrency(manualData.gci_pending)} />
                  <StatCard label="Active Listings" value={formatNumber(manualData.pipeline_count)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <StatCard label="Pending Deals" value={formatNumber(manualData.pending_deals)} />
                  <StatCard label="Total Volume" value={formatCurrency(manualData.total_volume)} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
