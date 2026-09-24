import { Badge } from '@/components/ui/badge';
import { GoalStatus } from '@/lib/planning2027';

export function StatusBadge({ status }: { status: GoalStatus | null }) {
  if (status === 'approved') return <Badge className="bg-primary text-primary-foreground">Approved</Badge>;
  if (status === 'submitted') return <Badge variant="secondary">Submitted</Badge>;
  if (status === 'draft') return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline" className="border-destructive/50 text-destructive">Not started</Badge>;
}
