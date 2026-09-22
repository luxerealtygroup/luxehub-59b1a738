import { BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuarterlyPipelineSummary, QuarterPipelineMetrics } from '@/hooks/useQuarterlyPipelineSummary';
import { formatCurrency } from '@/lib/utils';
import { formatWeightedDeals } from '@/lib/utils/dealWeight';

interface Props {
  agentUserId?: string | null;
  title?: string;
}

function MetricPanel({ label, metrics }: { label: string; metrics: QuarterPipelineMetrics }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-4">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-muted-foreground">Units</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{formatWeightedDeals(metrics.units)}</p>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-muted-foreground">Volume</p>
          <p className="min-w-0 text-right text-base font-bold tabular-nums text-foreground">{formatCurrency(metrics.volume)}</p>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-muted-foreground">GCI</p>
          <p className="min-w-0 text-right text-base font-bold tabular-nums text-foreground">{formatCurrency(metrics.gci)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <div><span className="text-muted-foreground">Pending</span><p className="font-semibold text-foreground">{formatWeightedDeals(metrics.pending)}</p></div>
        <div><span className="text-muted-foreground">Conditional</span><p className="font-semibold text-foreground">{formatWeightedDeals(metrics.conditional)}</p></div>
        <div><span className="text-muted-foreground">Closed</span><p className="font-semibold text-foreground">{formatWeightedDeals(metrics.closed)}</p></div>
      </div>
    </div>
  );
}

export default function QuarterlyPipelineSummary({ agentUserId, title = 'Pipeline Outlook' }: Props) {
  const { summary, loading } = useQuarterlyPipelineSummary(agentUserId);

  return (
    <Card className="border-gold/20 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-foreground">
          <BarChart3 className="h-5 w-5 text-gold" />
          {title}
        </CardTitle>
        {summary && (
          <p className="text-xs text-muted-foreground">
            Entered in {summary.cohortYear}, excluding lost/cancelled · actual or linked closing date, then expected closing date · sales 1 unit, leases 0.33
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pipeline…
          </div>
        ) : summary ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <MetricPanel label={summary.current.label} metrics={summary.current} />
            <MetricPanel label={summary.next.label} metrics={summary.next} />
            <MetricPanel label={`${summary.combinedLabel} Total`} metrics={summary.combined} />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Pipeline summary is unavailable.</p>
        )}
      </CardContent>
    </Card>
  );
}