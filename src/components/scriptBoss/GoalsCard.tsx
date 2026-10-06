import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, endOfMonth } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { LevelSession, LevelUnlock, PracticeGoal, goalLabel, goalProgress } from '@/lib/scriptLevels';

const sb = supabase as unknown as { from: (t: string) => any };

export function GoalsCard({ agentId, goals, unlocks, sessions, onChange, compact = false }: {
  agentId: string; goals: PracticeGoal[]; unlocks: LevelUnlock[]; sessions: LevelSession[]; onChange: () => void; compact?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PracticeGoal['goal_type']>('clear_levels');
  const [target, setTarget] = useState('2');
  const [due, setDue] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const mine = goals.filter(g => g.agent_id === agentId && g.status !== 'cancelled');

  const create = async () => {
    const t = Math.round(Number(target));
    if (!(t >= 1) || (type === 'reach_level' && t > 5)) { toast({ title: type === 'reach_level' ? 'Pick a level from 2 to 5' : 'Enter a target of 1 or more', variant: 'destructive' }); return; }
    const { error } = await sb.from('practice_goals').insert({ agent_id: agentId, goal_type: type, target: t, start_date: format(new Date(), 'yyyy-MM-dd'), due_date: due });
    if (error) { toast({ title: "Couldn't save the goal", description: error.message, variant: 'destructive' }); return; }
    setOpen(false); onChange();
  };
  const remove = async (id: string) => { await sb.from('practice_goals').update({ status: 'cancelled' }).eq('id', id); onChange(); };

  return (
    <Card data-testid="sb-goals">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="font-display text-xl">Practice goals</CardTitle>
        {!compact && <Button size="sm" variant="outline" onClick={() => setOpen(o => !o)}><Plus className="h-4 w-4 mr-1" /> New goal</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1.4fr_0.6fr_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label>Goal</Label>
              <Select value={type} onValueChange={v => { setType(v as PracticeGoal['goal_type']); setTarget(v === 'reach_level' ? '5' : v === 'passes_in_period' ? '10' : '2'); }}>
                <SelectTrigger aria-label="Goal type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clear_levels">Clear levels</SelectItem>
                  <SelectItem value="reach_level">Reach a level</SelectItem>
                  <SelectItem value="passes_in_period">Passing drills</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor="goal-target">{type === 'reach_level' ? 'Level' : 'How many'}</Label>
              <Input id="goal-target" type="number" min={1} max={type === 'reach_level' ? 5 : 500} value={target} onChange={e => setTarget(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="goal-due">By</Label><Input id="goal-due" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
            <Button onClick={create}>Save</Button>
          </div>
        )}
        {mine.length === 0 && <p className="text-sm text-muted-foreground">No goals yet. Try "Clear 2 levels this month" or "10 passing drills this month".</p>}
        {mine.map(g => {
          const p = goalProgress(g, unlocks, sessions);
          return (
            <div key={g.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{goalLabel(g)} by {format(new Date(`${g.due_date}T12:00:00`), 'MMM d')}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {p.done ? 'Done' : p.daysLeft < 0 ? 'Past due' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left`}
                  {!compact && <button type="button" aria-label="Remove goal" onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </span>
              </div>
              <Progress value={p.pct} aria-label={`${goalLabel(g)} progress`} />
              <p className="text-xs text-muted-foreground">{g.goal_type === 'reach_level' ? `Now at Level ${p.value} of ${g.target}` : `${p.value} of ${g.target}`}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
