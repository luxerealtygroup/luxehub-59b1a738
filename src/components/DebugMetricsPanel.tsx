import { DebugInfo } from '@/hooks/useFubDealMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bug } from 'lucide-react';

interface Props {
  debugInfo: DebugInfo | null;
  isAdmin: boolean;
}

export function DebugMetricsPanel({ debugInfo, isAdmin }: Props) {
  if (!isAdmin || !debugInfo) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5 mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono flex items-center gap-2 text-destructive">
          <Bug className="h-4 w-4" /> Debug Metrics Panel (admin only)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs font-mono space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <Row label="Effective Agent" value={debugInfo.effectiveAgentName || '(self)'} />
          <Row label="targetFubUserId" value={String(debugInfo.targetFubUserId ?? 'null')} />
          <Row label="Date Range" value={`${debugInfo.dateRangeStart} → ${debugInfo.dateRangeEnd}`} />
          <Row label="Data Source" value={debugInfo.source} />
          <Row label="Close Date Field" value={debugInfo.closeDateField} />
        </div>

        <div className="pt-2 border-t border-destructive/20">
          <p className="font-semibold mb-1">CLOSED_STAGES:</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {debugInfo.closedStageList.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
          </div>
          <p className="font-semibold mb-1">PENDING_STAGES:</p>
          <div className="flex flex-wrap gap-1">
            {debugInfo.pendingStageList.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
          </div>
        </div>

        <div className="pt-2 border-t border-destructive/20 grid grid-cols-2 md:grid-cols-4 gap-2">
          <CountBox label="Total deals (agent)" value={debugInfo.totalDealsForAgent} />
          <CountBox label="In date range" value={debugInfo.dealsInDateRange} />
          <CountBox label="In CLOSED stages" value={debugInfo.dealsInClosedStages} />
          <CountBox label="CLOSED + date range" value={debugInfo.dealsInClosedStagesAndDateRange} highlight />
        </div>

        <div className="pt-2 border-t border-destructive/20">
          <p className="font-semibold mb-1">Distinct stage values in agent deals:</p>
          <div className="flex flex-wrap gap-1">
            {debugInfo.distinctStageValues.length === 0
              ? <span className="text-muted-foreground">(none)</span>
              : debugInfo.distinctStageValues.map(s => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-semibold">{value}</span>
    </div>
  );
}

function CountBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded p-2 text-center ${highlight ? 'bg-green-500/20 border border-green-500/40' : 'bg-muted/30'}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
