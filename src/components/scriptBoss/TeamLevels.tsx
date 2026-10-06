import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScriptProgress, progressFor, goalLabel, goalProgress } from '@/lib/scriptLevels';

/** Owner/admin team view: each agent's level, passes toward the next, active goals, and a manual set-level override. */
export function TeamLevels({ agents }: { agents: { id: string; full_name: string | null }[] }) {
  const { toast } = useToast();
  const { levels, unlocks, sessions, goals, reload, loading } = useScriptProgress(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const nameOf = (id: string) => agents.find(a => a.id === id)?.full_name || 'an admin';

  const setLevel = async (agentId: string) => {
    const level = Number(pick[agentId]);
    const { data, error } = await supabase.functions.invoke('script-boss', { body: { action: 'set_level', agent_id: agentId, level } });
    if (error || (data as any)?.error) { toast({ title: "Couldn't set level", description: (data as any)?.error ?? error?.message, variant: 'destructive' }); return; }
    toast({ title: `Set to Level ${level}` }); reload();
  };

  if (loading) return null;
  return (
    <Card className="border-primary/10" data-testid="sb-team-levels">
      <CardHeader className="pb-3"><CardTitle className="font-display text-lg">Script Boss levels</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3">Agent</th><th className="py-1 pr-3">Level</th><th className="py-1 pr-3">Passes toward next</th><th className="py-1 pr-3">Active goals</th><th className="py-1">Set level</th>
          </tr></thead>
          <tbody>
            {agents.map(a => {
              const p = progressFor(levels, unlocks, sessions, a.id);
              const manual = unlocks.filter(u => u.agent_id === a.id && u.unlocked_by !== 'system').at(-1);
              const active = goals.filter(g => g.agent_id === a.id && g.status === 'active');
              return (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 font-medium">{a.full_name}</td>
                  <td className="py-2 pr-3">L{p.current} {p.cfg.name}
                    {manual && <div className="text-[11px] text-muted-foreground">Set manually by {nameOf(manual.unlocked_by)}</div>}</td>
                  <td className="py-2 pr-3">{p.maxed ? 'Top level' : `${p.passes} of ${p.needed} at ${p.cfg.pass_pct}%+`}</td>
                  <td className="py-2 pr-3">{active.length === 0 ? '—' : active.map(g => {
                    const gp = goalProgress(g, unlocks, sessions);
                    return <div key={g.id}>{goalLabel(g)}: {gp.value}/{g.target}{gp.daysLeft >= 0 ? ` · ${gp.daysLeft}d left` : ' · past due'}</div>;
                  })}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Select value={pick[a.id] ?? ''} onValueChange={v => setPick(s => ({ ...s, [a.id]: v }))}>
                        <SelectTrigger className="h-8 w-20" aria-label={`Set level for ${a.full_name}`}><SelectValue placeholder="L…" /></SelectTrigger>
                        <SelectContent>{[1, 2, 3, 4, 5].filter(n => n > p.current).map(n => <SelectItem key={n} value={String(n)}>L{n}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8" disabled={!pick[a.id]} onClick={() => setLevel(a.id)}>Set</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
