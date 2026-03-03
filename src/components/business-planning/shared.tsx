import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export const StatCard = ({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) => (
  <div className={`rounded-lg border p-4 ${danger ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-2xl font-bold ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>
);

export const GapBadge = ({ gap }: { gap: number }) => {
  if (gap > 0) return <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="h-3 w-3" />Pipeline Deficit: {gap} additions needed</Badge>;
  if (gap === 0) return <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="h-3 w-3" />On Track</Badge>;
  return <Badge className="bg-green-600 text-white gap-1"><TrendingUp className="h-3 w-3" />Ahead by {Math.abs(gap)} pipeline additions</Badge>;
};

export const BreakdownRow = ({ label, monthly, weekly, daily, highlight }: { label: string; monthly: number; weekly: number; daily: number; highlight?: boolean }) => (
  <div className={`grid grid-cols-4 gap-4 py-2 px-3 rounded ${highlight ? 'bg-destructive/5 border border-destructive/20' : 'even:bg-muted/30'}`}>
    <span className="text-sm font-medium text-foreground">{label}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(monthly)}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(weekly)}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(daily)}</span>
  </div>
);
