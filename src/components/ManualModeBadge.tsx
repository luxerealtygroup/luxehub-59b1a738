import { Badge } from '@/components/ui/badge';
import { Monitor } from 'lucide-react';

export function ManualModeBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1.5 py-1 px-3 text-xs font-medium">
      <Monitor className="h-3.5 w-3.5" />
      Preview Mode – Manual Production
    </Badge>
  );
}
