import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

interface Run {
  week_start: string;
  week_end: string;
  status: string;
  finished_at: string | null;
  error: string | null;
}

interface Props {
  /** Monday of the week currently being viewed, yyyy-MM-dd. */
  weekStart: string;
  onSynced?: () => void;
}

export default function FubWeeklySyncStatus({ weekStart, onSynced }: Props) {
  const { toast } = useToast();
  const { isAdmin, isOwner } = useUserRole();
  const canResync = Boolean(isAdmin || isOwner);
  const [latest, setLatest] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('fub_weekly_sync_runs')
      .select('week_start, week_end, status, finished_at, error')
      .order('started_at', { ascending: false })
      .limit(1);
    setLatest(((data ?? []) as Run[])[0] ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resync = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('sync-fub-weekly', {
      body: { week_start: weekStart },
    });
    setRunning(false);
    if (error) {
      toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
      return;
    }
    const result = (data as { results?: { status: string; synced: number }[] })?.results?.[0];
    toast({
      title: 'Week updated',
      description: `${result?.synced ?? 0} agent${result?.synced === 1 ? '' : 's'} refreshed from Follow Up Boss.`,
    });
    await load();
    onSynced?.();
  };

  const needsAttention = latest && latest.status !== 'ok';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        {needsAttention && <AlertTriangle className="h-4 w-4 text-destructive" />}
        {latest ? (
          <span>
            Last synced{' '}
            {latest.finished_at ? format(new Date(latest.finished_at), 'MMM d, yyyy h:mm a') : 'in progress'} for week
            of {format(new Date(`${latest.week_start}T12:00:00Z`), 'MMM d, yyyy')}
            {needsAttention ? ` · ${latest.error || latest.status}` : ''}
          </span>
        ) : (
          <span>No Follow Up Boss sync recorded yet.</span>
        )}
      </div>
      {canResync && (
        <Button variant="outline" size="sm" onClick={resync} disabled={running}>
          {running ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
          Re-sync this week
        </Button>
      )}
    </div>
  );
}
