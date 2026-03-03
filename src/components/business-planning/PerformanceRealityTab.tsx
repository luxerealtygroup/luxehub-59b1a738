import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BarChart3, Crosshair, Save, Pencil, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { ActiveMetrics, ActiveListingDebug, GoalInputs, currentYear, safe } from './types';
import { StatCard } from './shared';
import { toast } from 'sonner';

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
          setForm({
            closed_deals: safe(data.closed_deals),
            pending_deals: safe(data.pending_deals),
            gci_closed: safe(data.gci_closed),
            gci_pending: safe(data.gci_pending),
            total_volume: safe(data.total_volume),
            pipeline_count: safe(data.pipeline_count),
            database_size: safe(data.database_size),
          });
          onSaved({
            closed_deals: safe(data.closed_deals),
            pending_deals: safe(data.pending_deals),
            gci_closed: safe(data.gci_closed),
            gci_pending: safe(data.gci_pending),
            total_volume: safe(data.total_volume),
            pipeline_count: safe(data.pipeline_count),
            database_size: safe(data.database_size),
          });
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

export function PerformanceRealityTab({
  metrics, mode, dateRange, customStart, customEnd,
  isAdmin, debugInfo, activeListingDebug, goals, effectiveRates, uid, quarter, onManualMetrics,
}: Props) {
  // Q Target: use goals.gci_target if set, else derive from annual target / 4
  const qTargetGCI = goals.gci_target > 0
    ? goals.gci_target
    : (metrics?.targetGCI && metrics.targetGCI > 0 ? Math.round(metrics.targetGCI / 4) : 0);
  const avgGCIPerDeal = metrics?.avgCommission && metrics.avgCommission > 0
    ? metrics.avgCommission
    : (goals.avg_commission > 0 ? goals.avg_commission : 0);
  const hasTarget = qTargetGCI > 0 && avgGCIPerDeal > 0;
  const requiredClosings = hasTarget ? Math.ceil(qTargetGCI / avgGCIPerDeal) : 0;
  const pendingInQ = metrics ? metrics.pendingDeals : 0;
  const activeLikelyClosings = metrics ? Math.round(metrics.activeListings * 0.5) : 0;
  const pipelineGap = hasTarget ? requiredClosings - pendingInQ - activeLikelyClosings : null;
  const gapCMAs = pipelineGap && pipelineGap > 0 && effectiveRates.cmaToListing > 0 ? Math.ceil(pipelineGap / (effectiveRates.cmaToListing / 100)) : 0;
  const gapAppts = pipelineGap && pipelineGap > 0 && effectiveRates.apptToContract > 0 ? Math.ceil(pipelineGap / (effectiveRates.apptToContract / 100)) : 0;

  const rangeLabel = dateRange === 'ytd' ? 'YTD' : dateRange === 'custom' ? `${customStart} → ${customEnd}` : dateRange.toUpperCase();

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
              {pipelineGap === null ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-600">No Q{quarter} target set</p>
                  <p className="text-xs text-muted-foreground mt-1">Set a GCI target in the Strategy & Goals tab to enable pipeline gap analysis.</p>
                </div>
              ) : (
                <>
                  {/* Subtraction formula */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2 font-mono text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Required Q{quarter} Closings</span>
                      <span className="font-bold text-foreground">{formatNumber(requiredClosings)}</span>
                    </div>
                    <div className="flex items-center justify-between text-destructive">
                      <span>− Pending Deals (closing in Q)</span>
                      <span className="font-bold">{formatNumber(pendingInQ)}</span>
                    </div>
                    <div className="flex items-center justify-between text-destructive">
                      <span>− Active Likely Closings (50% weight)</span>
                      <span className="font-bold">{formatNumber(activeLikelyClosings)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${pipelineGap > 0 ? 'text-amber-600' : 'text-green-600'}`}>= Gap</span>
                      <span className={`text-lg font-bold ${pipelineGap > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {pipelineGap > 0 ? `${pipelineGap} deals` : pipelineGap === 0 ? 'On Track' : `Ahead by ${Math.abs(pipelineGap)}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    {pipelineGap > 0 ? (
                      <Badge className="bg-amber-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />At Risk: {pipelineGap} deals short</Badge>
                    ) : pipelineGap === 0 ? (
                      <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="h-3 w-3" />On Track</Badge>
                    ) : (
                      <Badge className="bg-green-600 text-white gap-1"><TrendingUp className="h-3 w-3" />Ahead by {Math.abs(pipelineGap)} deals</Badge>
                    )}
                  </div>

                  {pipelineGap > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <StatCard label="Additional CMAs Needed" value={formatNumber(gapCMAs)} danger />
                      <StatCard label="Additional Appts Needed" value={formatNumber(gapAppts)} danger />
                    </div>
                  )}

                  {isAdmin && (
                    <div className="rounded border border-muted bg-muted/30 p-3 text-xs font-mono space-y-1 mt-3">
                      <p className="font-semibold text-muted-foreground">Gap Debug</p>
                      <p>Q{quarter} Target GCI: <span className="font-bold">{formatCurrency(qTargetGCI)}</span> {goals.gci_target > 0 ? '(from Q goals)' : '(annual ÷ 4)'}</p>
                      <p>Avg GCI per deal: <span className="font-bold">{formatCurrency(avgGCIPerDeal)}</span></p>
                      <p>Date range: <span className="font-bold">{rangeLabel}</span></p>
                      <p>Pending deals counted: <span className="font-bold">{pendingInQ}</span></p>
                      <p>Active listings counted: <span className="font-bold">{metrics?.activeListings ?? 0}</span> (weighted: {activeLikelyClosings})</p>
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
