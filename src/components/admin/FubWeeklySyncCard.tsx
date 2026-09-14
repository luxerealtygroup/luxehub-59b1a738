import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { format, startOfWeek, subWeeks } from 'date-fns';

interface Run {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  agents_synced: number | null;
  agents_unmatched: number | null;
  error: string | null;
}

interface TeamRow {
  id: string;
  full_name: string | null;
  email: string | null;
  fub_user_id: number | null;
}

interface FubUser {
  id: number;
  name?: string;
  email?: string;
}

const lastCompletedMonday = () =>
  format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');

export default function FubWeeklySyncCard() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [fubUsers, setFubUsers] = useState<FubUser[]>([]);
  const [week, setWeek] = useState(lastCompletedMonday());
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [{ data: runRows }, { data: teamRows }] = await Promise.all([
      supabase
        .from('fub_weekly_sync_runs')
        .select('id, week_start, week_end, status, started_at, finished_at, agents_synced, agents_unmatched, error')
        .order('started_at', { ascending: false })
        .limit(5),
      supabase
        .from('profiles')
        .select('id, full_name, email, fub_user_id')
        .order('full_name'),
    ]);
    setRuns((runRows ?? []) as Run[]);
    setTeam((teamRows ?? []) as TeamRow[]);

    const latestWeek = (runRows as Run[] | null)?.[0]?.week_start;
    if (latestWeek) {
      const { data: weekly } = await supabase
        .from('weekly_411')
        .select('user_id, fub_sync_status')
        .eq('week_start_date', latestWeek);
      const map: Record<string, string> = {};
      for (const row of (weekly ?? []) as { user_id: string; fub_sync_status: string | null }[]) {
        map[row.user_id] = row.fub_sync_status ?? 'not synced';
      }
      setCounts(map);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke('follow-up-boss', {
        body: { action: 'get_users', params: { limit: 100 } },
      });
      const users = (data as { data?: { users?: FubUser[] } })?.data?.users ?? [];
      setFubUsers(users);
    })();
  }, []);

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('sync-fub-weekly', {
      body: { week_start: week },
    });
    setRunning(false);
    if (error) {
      toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
      return;
    }
    const result = (data as { results?: { status: string; synced: number; unmatched: number }[] })?.results?.[0];
    toast({
      title: result?.status === 'ok' ? 'Week updated' : 'Sync finished',
      description: result
        ? `${result.synced} agent${result.synced === 1 ? '' : 's'} updated, ${result.unmatched} without a Follow Up Boss match.`
        : 'Done.',
    });
    load();
  };

  const setFubUser = async (profileId: string, fubUserId: string) => {
    const picked = fubUsers.find((u) => String(u.id) === fubUserId);
    const { error } = await supabase
      .from('profiles')
      .update({ fub_user_id: picked?.id ?? null, fub_user_email: picked?.email ?? null })
      .eq('id', profileId);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Matched' });
    load();
  };

  const unmatched = team.filter((t) => !t.fub_user_id);
  const latest = runs[0];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">Weekly Follow Up Boss numbers</CardTitle>
        <CardDescription>
          Runs automatically every Sunday at 8pm and fills in each agent's measured activity for the week
          that just ended.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-sm">
          {latest ? (
            <p>
              Last run {latest.finished_at ? format(new Date(latest.finished_at), 'MMM d, yyyy h:mm a') : 'in progress'} ·
              week of {format(new Date(`${latest.week_start}T12:00:00Z`), 'MMM d')} –{' '}
              {format(new Date(`${latest.week_end}T12:00:00Z`), 'MMM d, yyyy')} ·{' '}
              <Badge variant={latest.status === 'ok' ? 'secondary' : 'destructive'}>{latest.status}</Badge>
              {latest.error ? <span className="block text-destructive">{latest.error}</span> : null}
            </p>
          ) : (
            <p className="text-muted-foreground">No run recorded yet.</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Week starting (Monday)</Label>
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="w-44" />
          </div>
          <Button onClick={runNow} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run now
          </Button>
        </div>

        {latest && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Agents in the last run</p>
            <div className="divide-y rounded-md border text-sm">
              {team.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2">
                  <span>{t.full_name || t.email}</span>
                  <span className="text-muted-foreground">{counts[t.id] ?? 'no row'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">No Follow Up Boss match ({unmatched.length})</p>
            <p className="text-xs text-muted-foreground">
              Emails didn't line up. Pick the right person — we never guess by name.
            </p>
            {unmatched.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2">
                <span className="w-48 text-sm">{t.full_name || t.email}</span>
                <Select onValueChange={(v) => setFubUser(t.id, v)}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose Follow Up Boss user" />
                  </SelectTrigger>
                  <SelectContent>
                    {fubUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name || u.email} {u.email ? `· ${u.email}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
