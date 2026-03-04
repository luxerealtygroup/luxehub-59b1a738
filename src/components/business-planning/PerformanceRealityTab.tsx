import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PipelineDebug } from '@/hooks/usePipelineMetrics';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BarChart3, Crosshair, Save, Pencil, AlertTriangle, CheckCircle, TrendingUp, Info } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { ActiveMetrics, ActiveListingDebug, GoalInputs, currentYear, safe } from './types';
import { StatCard } from './shared';
import { toast } from 'sonner';

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
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-gold" />
              Performance Reality
              <Badge variant="outline" className="ml-2 text-xs font-normal">{rangeLabel} {currentYear}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label={`${rangeLabel} Closed Deals`} value={formatNumber(metrics.ytdClosedDeals)} />
              <StatCard label={`${rangeLabel} GCI`} value={formatCurrency(metrics.ytdGCI)} />
              <StatCard label="Pending GCI" value={formatCurrency(metrics.pendingGCI)} />
              <StatCard label="Active Listings" value={formatNumber(metrics.activeListings)} />
            </div>

            {isAdmin && (
              <div className="rounded border border-destructive/20 bg-destructive/5 p-3 text-xs font-mono space-y-1">
                <p className="font-semibold text-destructive">Active Listings Debug</p>
                <p>Stages included: {activeListingDebug.stagesIncluded.join(', ')}</p>
                <p>Total active listings: <span className="font-bold">{activeListingDebug.totalActiveListings}</span></p>
                <p>Offer deals included (listing-side): <span className="font-bold">{activeListingDebug.offerDealsIncluded}</span></p>
                <p>Offer deals excluded (buyer-side): <span className="font-bold">{activeListingDebug.offerDealsExcludedBuyerSide}</span></p>
                {activeListingDebug.offerDealsUnclassified > 0 && (
                  <p className="text-amber-500">⚠ Offer deals unclassified (excluded): <span className="font-bold">{activeListingDebug.offerDealsUnclassified}</span></p>
                )}
                {activeListingDebug.top10.length > 0 && (
                  <div className="mt-1">
                    <p className="font-semibold">Top 10 active listing deals:</p>
                    {activeListingDebug.top10.map((d, i) => (
                      <p key={i} className="pl-2">#{d.id} — stage: "{d.stage}" pipeline: "{d.pipeline}" side: {d.inferredSide}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="CMA → Listing" value={`${metrics.cmaToListingPct}%`} />
              <StatCard label="Appt → Contract" value={`${metrics.apptToContractPct}%`} />
              <StatCard label="Contact → Appt" value={`${metrics.contactToApptPct}%`} />
              <StatCard label="Dials → Appt" value={`${metrics.dialsToApptPct}%`} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard
                label="Projected Year-End GCI"
                value={formatCurrency(metrics.projectedYearEndGCI)}
                sub={metrics.targetGCI > 0 ? `Target: ${formatCurrency(metrics.targetGCI)}` : undefined}
              />
              {metrics.targetGCI > 0 && (
                <StatCard
                  label="Gap to Target"
                  value={metrics.gapToTarget > 0 ? formatCurrency(metrics.gapToTarget) : 'On Track'}
                  danger={metrics.gapToTarget > 0}
                  sub={metrics.gapToTarget > 0 ? 'Shortfall at current pace' : 'Projected to meet or exceed'}
                />
              )}
            </div>

            <Separator />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Crosshair className="h-4 w-4" /> Pipeline Deficit Analysis
              </h3>

              {pipelineDeficit === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-600">
                    <Info className="h-4 w-4 inline mr-1" />
                    Set Q{quarter} Goal
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Set a GCI target in the Strategy & Goals tab to enable pipeline deficit analysis.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2 font-mono text-sm">
                    {prevQGap > 0 && (
                      <div className="flex items-center justify-between text-amber-600">
                        <span>Q{prevQ} Deal Gap (carryover)</span>
                        <span className="font-bold">+{prevQGap} deals</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Q{quarter} Base Closings Goal</span>
                      <span className="font-bold text-foreground">{formatNumber(q2BaseGoal)} deals</span>
                    </div>
                    {prevQGap > 0 && (
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-foreground">Adjusted Q{quarter} Required</span>
                        <span className="text-foreground">{formatNumber(adjustedClosingsGoal)} deals</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>÷ Conversion Factor ({Math.round(conversionFactor * 100)}%)</span>
                      <span className="text-xs">(100% − {Math.round(falloutRate * 100)}% fallout)</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-foreground">Required Pipeline Deals</span>
                      <span className="text-foreground">{formatNumber(requiredPipelineDeals)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Current Pipeline (Q{prevQ}+Q{quarter})</span>
                       <span className="font-bold text-foreground">{formatNumber(currentPipelineDeals)}</span>
                     </div>
                     {missingDateCount > 0 && (
                       <div className="flex items-center justify-between text-amber-600 text-xs">
                         <span><AlertTriangle className="h-3 w-3 inline mr-1" />{missingDateCount} client(s) missing expected pending date — not counted</span>
                       </div>
                     )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      {pipelineDeficit > 0 ? (
                        <>
                          <span className="font-bold text-destructive">= Pipeline Deficit</span>
                          <span className="text-lg font-bold text-destructive">{pipelineDeficit} more pipeline additions needed</span>
                        </>
                      ) : pipelineSurplus > 0 ? (
                        <>
                          <span className="font-bold text-green-600">= Pipeline Surplus</span>
                          <span className="text-lg font-bold text-green-600">+{pipelineSurplus} deals ahead</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-green-600">= Pipeline Covered</span>
                          <span className="text-lg font-bold text-green-600">Exactly on target</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    {pipelineDeficit > 0 ? (
                      <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="h-3 w-3" />Pipeline Deficit: {pipelineDeficit} additions needed</Badge>
                    ) : pipelineSurplus > 0 ? (
                      <Badge className="bg-green-600 text-white gap-1"><TrendingUp className="h-3 w-3" />Ahead by {pipelineSurplus} pipeline deals</Badge>
                    ) : (
                      <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="h-3 w-3" />Pipeline Covered</Badge>
                    )}
                  </div>

                  {isAdmin && (
                     <div className="rounded border border-muted bg-muted/30 p-3 text-xs font-mono space-y-1 mt-3">
                       <p className="font-semibold text-muted-foreground">Pipeline Deficit Debug (pipeline_clients table)</p>
                       <p>effectiveUserId: <span className="font-bold">{pipelineGapData.pipelineDebug.effectiveUserId ?? 'null'}</span></p>
                       <p>Date range: <span className="font-bold">{pipelineGapData.pipelineDebug.dateRangeStart} → {pipelineGapData.pipelineDebug.dateRangeEnd}</span></p>
                       <p>Total pipeline clients (all): <span className="font-bold">{pipelineGapData.pipelineTotalAll}</span></p>
                       <p>After date filter (Q{prevQ}+Q{quarter}): <span className="font-bold">{pipelineGapData.pipelineDebug.afterDateFilter}</span></p>
                       <p>Missing expected_pending_date: <span className="font-bold">{pipelineGapData.pipelineDebug.missingDateCount}</span></p>
                       <p>Q{quarter} Target GCI: <span className="font-bold">{formatCurrency(qTargetGCI)}</span> {goals.gci_target > 0 ? '(from Q goals)' : '(annual ÷ 4)'}</p>
                       <p>Avg GCI/deal: <span className="font-bold">{formatCurrency(avgGCIPerDeal)}</span></p>
                       <p>Q{quarter} Base Goal: {q2BaseGoal} | Q{prevQ} Gap: {prevQGap} | Adjusted: {adjustedClosingsGoal} | Fallout: {Math.round(falloutRate * 100)}% | Required Pipeline: {requiredPipelineDeals}</p>
                       <p>Q{prevQ} Required: {pipelineGapData.prevQRequiredClosings} | Q{prevQ} Actual: {pipelineGapData.prevQActualClosings}</p>
                       {pipelineGapData.pipelineDebug.top5.length > 0 && (
                         <div className="mt-1">
                           <p className="font-semibold">First 5 pipeline clients:</p>
                           {pipelineGapData.pipelineDebug.top5.map((c, i) => (
                             <p key={i} className="pl-2">#{c.id.slice(0,8)} — {c.client_name} stage:{c.stage} pendingDate:{c.expected_pending_date ?? 'null'}</p>
                           ))}
                         </div>
                       )}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
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
