import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BarChart3, Crosshair, Save, Pencil } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { ActiveMetrics, ActiveListingDebug, GoalInputs, currentYear, safe } from './types';
import { StatCard, GapBadge } from './shared';
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
  isAdmin, debugInfo, activeListingDebug, goals, effectiveRates, uid, onManualMetrics,
}: Props) {
  const netPerDeal = goals.avg_commission * (goals.split_percent / 100);
  const requiredClosings = netPerDeal > 0 ? Math.ceil(goals.gci_target / netPerDeal) : 0;
  const pipelineGap = metrics ? requiredClosings - (metrics.pendingDeals + Math.round(metrics.activeListings * 0.5)) : 0;
  const gapCMAs = pipelineGap > 0 && effectiveRates.cmaToListing > 0 ? Math.ceil(pipelineGap / (effectiveRates.cmaToListing / 100)) : 0;
  const gapAppts = pipelineGap > 0 && effectiveRates.apptToContract > 0 ? Math.ceil(pipelineGap / (effectiveRates.apptToContract / 100)) : 0;

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
              <div className="flex items-center gap-3 mb-4">
                <GapBadge gap={pipelineGap} />
              </div>
              {pipelineGap > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <StatCard label="Pipeline Gap" value={`${pipelineGap} deals`} danger />
                  <StatCard label="Additional CMAs Needed" value={formatNumber(gapCMAs)} danger />
                  <StatCard label="Additional Appts Needed" value={formatNumber(gapAppts)} danger />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <StatCard label="Required Q Closings" value={formatNumber(requiredClosings)} />
                <StatCard label="Pending Deals" value={formatNumber(metrics.pendingDeals)} />
                <StatCard label="Active Likely Closings" value={formatNumber(Math.round(metrics.activeListings * 0.5))} />
              </div>
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
