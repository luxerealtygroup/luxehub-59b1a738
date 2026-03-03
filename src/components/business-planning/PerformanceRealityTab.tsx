import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

// ── Pipeline gap data computed in parent from allDeals (same source as Pipeline tab) ──
export interface PipelineGapData {
  /** Q(n-1) actual closings from FUB */
  prevQActualClosings: number;
  /** Q(n-1) required closings (goal-based) */
  prevQRequiredClosings: number;
  /** Pipeline total: non-closed, non-lost deals with projectedCloseDate in prev+current Q */
  pipelineTotal: number;
  /** Count before date filter (debug) */
  pipelineBeforeDateFilter: number;
  /** Stages included in pipeline count */
  pipelineStagesIncluded: string[];
  /** Date range used for pipeline */
  pipelineDateRange: { start: string; end: string };
  /** effectiveFubUserId used */
  effectiveFubUserId: number | null;
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

  // ── Pipeline Gap Analysis with carryover + fallout ──
  const qTargetGCI = goals.gci_target > 0
    ? goals.gci_target
    : (metrics?.targetGCI && metrics.targetGCI > 0 ? Math.round(metrics.targetGCI / 4) : 0);
  const avgGCIPerDeal = metrics?.avgCommission && metrics.avgCommission > 0
    ? metrics.avgCommission
    : (goals.avg_commission > 0 ? goals.avg_commission : 0);

  const hasTarget = qTargetGCI > 0 && avgGCIPerDeal > 0;

  // Q base goal (closings)
  const qBaseGoal = hasTarget ? Math.ceil(qTargetGCI / avgGCIPerDeal) : 0;

  // Prev Q carryover
  const prevQGap = Math.max(0, pipelineGapData.prevQRequiredClosings - pipelineGapData.prevQActualClosings);

  // Adjusted required
  const adjustedRequired = qBaseGoal + prevQGap;

  // Pipeline with fallout
  const falloutRate = DEFAULT_FALLOUT_RATE;
  const pipelineTotal = pipelineGapData.pipelineTotal;
  const effectivePipeline = Math.round(pipelineTotal * (1 - falloutRate));
  const finalGap = hasTarget ? Math.max(0, adjustedRequired - effectivePipeline) : null;

  // Manual metrics state for planning mode display
  const [manualData, setManualData] = useState<ManualPerformance | null>(null);

  const handleManualSaved = useCallback((m: ManualPerformance) => {
    setManualData(m);
    onManualMetrics?.(m);
  }, [onManualMetrics]);

  const prevQ = quarter > 1 ? quarter - 1 : 4;

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
                <p>effectiveFubUserId: <span className="font-bold">{activeListingDebug.effectiveFubUserId ?? 'null'}</span></p>
                <p>Stages included: {activeListingDebug.stagesIncluded.join(', ')}</p>
                <p>Raw deals for agent: <span className="font-bold">{activeListingDebug.rawDealCount}</span></p>
                <p>Active stage match (before owner filter): <span className="font-bold">{activeListingDebug.activeBeforeOwnerFilter}</span></p>
                <p>Active listings (after owner filter): <span className="font-bold">{activeListingDebug.activeListingCount}</span></p>
                {activeListingDebug.top5.length > 0 && (
                  <div className="mt-1">
                    <p className="font-semibold">Top 5 active listing deals:</p>
                    {activeListingDebug.top5.map((d, i) => (
                      <p key={i} className="pl-2">#{d.id} — stage: "{d.stage}" pipeline: "{d.pipeline}" assignedUserId: {d.assignedUserId} userId: {d.userId} users: {d.users}</p>
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
                <Crosshair className="h-4 w-4" /> Pipeline Gap Analysis
              </h3>

              {finalGap === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-600">
                    <Info className="h-4 w-4 inline mr-1" />
                    Set Q{quarter} Goal
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Set a GCI target in the Strategy & Goals tab to enable pipeline gap analysis.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2 font-mono text-sm">
                    {/* Carryover */}
                    {prevQGap > 0 && (
                      <div className="flex items-center justify-between text-amber-600">
                        <span>Q{prevQ} Deal Gap (carryover)</span>
                        <span className="font-bold">+{formatNumber(prevQGap)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Q{quarter} Base Goal (closings)</span>
                      <span className="font-bold text-foreground">{formatNumber(qBaseGoal)}</span>
                    </div>
                    {prevQGap > 0 && <Separator />}
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-foreground">Adjusted Q{quarter} Required</span>
                      <span className="text-foreground">{formatNumber(adjustedRequired)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Pipeline Total (Q{prevQ}+Q{quarter})</span>
                      <span className="font-bold text-foreground">{formatNumber(pipelineTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>× Fallout Rate ({Math.round(falloutRate * 100)}%)</span>
                      <span className="font-bold">−{formatNumber(pipelineTotal - effectivePipeline)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Effective Pipeline (after fallout)</span>
                      <span className="font-bold text-foreground">{formatNumber(effectivePipeline)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${finalGap > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        = Final Gap
                      </span>
                      <span className={`text-lg font-bold ${finalGap > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {finalGap > 0
                          ? `${finalGap} deals`
                          : effectivePipeline > adjustedRequired
                            ? `Ahead by ${effectivePipeline - adjustedRequired}`
                            : 'Covered'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    {finalGap > 0 ? (
                      <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="h-3 w-3" />Deficit: {finalGap} deals</Badge>
                    ) : effectivePipeline > adjustedRequired ? (
                      <Badge className="bg-green-600 text-white gap-1"><TrendingUp className="h-3 w-3" />Ahead by {effectivePipeline - adjustedRequired} deals</Badge>
                    ) : (
                      <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="h-3 w-3" />Covered</Badge>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="rounded border border-muted bg-muted/30 p-3 text-xs font-mono space-y-1 mt-3">
                      <p className="font-semibold text-muted-foreground">Pipeline Gap Debug</p>
                      <p>effectiveFubUserId: <span className="font-bold">{pipelineGapData.effectiveFubUserId ?? 'null'}</span></p>
                      <p>Q{quarter} Target GCI: <span className="font-bold">{formatCurrency(qTargetGCI)}</span> {goals.gci_target > 0 ? '(from Q goals)' : '(annual ÷ 4)'}</p>
                      <p>Avg GCI per deal: <span className="font-bold">{formatCurrency(avgGCIPerDeal)}</span></p>
                      <p>Q{prevQ} date range: <span className="font-bold">{pipelineGapData.pipelineDateRange.start} → {pipelineGapData.pipelineDateRange.end}</span></p>
                      <p>Q{prevQ} required: {pipelineGapData.prevQRequiredClosings} | actual: {pipelineGapData.prevQActualClosings} | gap: {prevQGap}</p>
                      <p>Pipeline stages: {pipelineGapData.pipelineStagesIncluded.join(', ')}</p>
                      <p>Pipeline before date filter: <span className="font-bold">{pipelineGapData.pipelineBeforeDateFilter}</span></p>
                      <p>Pipeline after date filter: <span className="font-bold">{pipelineTotal}</span></p>
                      <p>Fallout rate: {Math.round(falloutRate * 100)}% → effective: {effectivePipeline}</p>
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
