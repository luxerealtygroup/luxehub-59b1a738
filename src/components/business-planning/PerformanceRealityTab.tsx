import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart3, Crosshair } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { ActiveMetrics, ActiveListingDebug, GoalInputs, currentYear } from './types';
import { StatCard, GapBadge } from './shared';

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
}

export function PerformanceRealityTab({
  metrics, mode, dateRange, customStart, customEnd,
  isAdmin, debugInfo, activeListingDebug, goals, effectiveRates,
}: Props) {
  const netPerDeal = goals.avg_commission * (goals.split_percent / 100);
  const requiredClosings = netPerDeal > 0 ? Math.ceil(goals.gci_target / netPerDeal) : 0;
  const pipelineGap = metrics ? requiredClosings - (metrics.pendingDeals + Math.round(metrics.activeListings * 0.5)) : 0;
  const gapCMAs = pipelineGap > 0 && effectiveRates.cmaToListing > 0 ? Math.ceil(pipelineGap / (effectiveRates.cmaToListing / 100)) : 0;
  const gapAppts = pipelineGap > 0 && effectiveRates.apptToContract > 0 ? Math.ceil(pipelineGap / (effectiveRates.apptToContract / 100)) : 0;

  const rangeLabel = dateRange === 'ytd' ? 'YTD' : dateRange === 'custom' ? `${customStart} → ${customEnd}` : dateRange.toUpperCase();

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
              <BarChart3 className="h-5 w-5 text-gold" /> Performance Reality
              <Badge variant="outline" className="ml-2 text-xs font-normal">Planning Mode</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Switch to Active Agent mode to view live performance metrics from FUB.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
