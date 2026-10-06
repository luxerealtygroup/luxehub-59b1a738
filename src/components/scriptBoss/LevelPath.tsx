import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_LEVELS, ScriptLevel, progressFor, LevelUnlock, LevelSession } from '@/lib/scriptLevels';

function Ring({ value, max }: { value: number; max: number }) {
  const r = 34, c = 2 * Math.PI * r, frac = max ? value / max : 0;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary transition-all"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" className="fill-foreground text-base font-semibold">{value}/{max}</text>
    </svg>
  );
}

export function LevelPath({ levels, unlocks, sessions, agentId }: { levels: ScriptLevel[]; unlocks: LevelUnlock[]; sessions: LevelSession[]; agentId: string }) {
  const p = progressFor(levels, unlocks, sessions, agentId);
  const list = [1, 2, 3, 4, 5].map(n => levels.find(l => l.level === n) ?? (DEFAULT_LEVELS[n - 1] as ScriptLevel));
  return (
    <Card data-testid="sb-level-path">
      <CardHeader className="pb-3"><CardTitle className="font-display text-xl">Your level path</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <ol className="grid grid-cols-5 gap-1 sm:gap-2">
          {list.map(l => {
            const done = l.level < p.current, cur = l.level === p.current, locked = l.level > p.current;
            return (
              <li key={l.level} className={cn('relative flex flex-col items-center text-center rounded-lg border p-2 sm:p-3',
                cur && 'border-primary bg-primary/10 ring-2 ring-primary', done && 'border-border bg-muted/40', locked && 'border-dashed border-border opacity-50')}
                aria-current={cur ? 'step' : undefined} data-level={l.level} data-state={cur ? 'current' : done ? 'done' : 'locked'}>
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                  cur ? 'bg-primary text-primary-foreground' : done ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground')}>
                  {locked ? <Lock className="h-4 w-4" aria-label="Locked" /> : done ? <Check className="h-4 w-4" aria-label="Cleared" /> : l.level}
                </span>
                <span className="mt-1 text-[11px] sm:text-xs font-medium leading-tight">L{l.level} {l.name}</span>
                <span className="hidden sm:block mt-0.5 text-[10px] text-muted-foreground leading-tight">{l.description}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-4" data-testid="sb-progress-ring">
          <Ring value={p.maxed ? p.needed : p.passes} max={p.needed} />
          <div className="space-y-1">
            <p className="font-medium">
              {p.maxed ? `Level 5 — ${p.cfg.name}. Top level reached; keep the reps going.`
                : `${p.passes} of ${p.needed} passes at ${p.cfg.pass_pct}%+ to unlock Level ${p.current + 1}`}
            </p>
            <p className="text-xs text-muted-foreground">Graded drills (voice or typed) count. REVIEW uploads don't.</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Last 5 scores at Level {p.current}</p>
          {p.recent.length === 0 ? <p className="text-sm text-muted-foreground">No drills at this level yet.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {p.recent.map(s => <Badge key={s.id} variant={s.passed ? 'default' : 'outline'}>{s.score_pct}%{s.passed ? ' ✓' : ''}</Badge>)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
