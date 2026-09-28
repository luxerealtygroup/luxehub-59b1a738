import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Lock, Plus, Star } from 'lucide-react';

export const CIRCLES = [
  ['spiritual', 'Spiritual life'],
  ['physical', 'Physical health'],
  ['personal', 'Personal life'],
  ['relationships', 'Key relationships'],
  ['job', 'Job'],
  ['business', 'Business'],
  ['financial', 'Financial life'],
] as const;
export type CircleKey = typeof CIRCLES[number][0];
export interface CircleEntry { today?: number | null; target?: number | null; one_thing?: string | null; show_one?: boolean }
export type Circles = Partial<Record<CircleKey, CircleEntry>>;

const ONE_LABEL = 'My ONE Thing for 2027 — the one action that makes everything else easier or unnecessary.';

export const gapOf = (e?: CircleEntry) => (e?.today != null && e?.target != null ? e.target - e.today : null);

/** The two circles with the biggest positive gap (ties keep list order). */
export function topGaps(c: Circles): CircleKey[] {
  return CIRCLES.map(([k]) => ({ k, g: gapOf(c[k]) }))
    .filter(x => x.g != null && x.g > 0)
    .sort((a, b) => (b.g as number) - (a.g as number))
    .slice(0, 2).map(x => x.k);
}

/** Returns an error message if the circles can't be submitted, else null. */
export function circlesSubmitError(c: Circles): string | null {
  const missing = CIRCLES.filter(([k]) => c[k]?.today == null || c[k]?.target == null);
  if (missing.length) return `Score every circle (today and Dec 31, 2027) — missing: ${missing.map(m => m[1]).join(', ')}`;
  const top = topGaps(c).filter(k => !c[k]?.one_thing?.trim());
  if (top.length) return `Add your ONE Thing for ${top.map(k => CIRCLES.find(x => x[0] === k)![1]).join(' and ')}`;
  return null;
}

function Score({ id, value, onChange, ed, label }: { id: string; value?: number | null; onChange: (v: number) => void; ed: boolean; label: string }) {
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value != null ? String(value) : undefined} onValueChange={v => onChange(Number(v))} disabled={!ed}>
        <SelectTrigger id={id} className="h-10 w-full"><SelectValue placeholder="–" /></SelectTrigger>
        <SelectContent>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function SevenCirclesSection({ circles, setCircles, editable }: {
  circles: Circles; setCircles?: (fn: (c: Circles) => Circles) => void; editable: boolean;
}) {
  const ed = editable && !!setCircles;
  const top = topGaps(circles);
  const upd = (k: CircleKey, p: Partial<CircleEntry>) => setCircles?.(c => ({ ...c, [k]: { ...c[k], ...p } }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">The seven circles <Lock className="h-3.5 w-3.5 text-muted-foreground" /></CardTitle>
        <p className="text-sm text-muted-foreground">Score each circle of your life today and where you want it to be by December 31, 2027. Adapted from The ONE Thing by Gary Keller and Jay Papasan.</p>
        <p className="text-xs text-muted-foreground">Private — only you and Kristen can see this.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {CIRCLES.map(([k, label]) => {
          const e = circles[k] ?? {};
          const g = gapOf(e);
          const isTop = top.includes(k);
          const showOne = isTop || e.show_one || !!e.one_thing;
          return (
            <div key={k} className={`rounded-lg border p-3 space-y-3 ${isTop ? 'border-gold bg-gold/5' : 'border-border'}`}>
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] items-end gap-3">
                <div className="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0 sm:self-center">
                  {isTop && <Star className="h-4 w-4 shrink-0 text-gold fill-current" />}
                  <span className="font-medium text-foreground">{label}</span>
                  {isTop && <span className="text-[11px] text-gold">Biggest gap</span>}
                </div>
                <div className="col-span-2 sm:col-span-3 grid grid-cols-3 sm:grid-cols-[7rem_7rem_5rem] gap-3 items-end">
                  <Score id={`${k}-today`} label="Today" value={e.today} onChange={v => upd(k, { today: v })} ed={ed} />
                  <Score id={`${k}-target`} label="Dec 31, 2027" value={e.target} onChange={v => upd(k, { target: v })} ed={ed} />
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Gap</p>
                    <p className={`h-10 flex items-center font-semibold ${isTop ? 'text-gold' : 'text-foreground'}`}>{g == null ? '—' : g > 0 ? `+${g}` : g}</p>
                  </div>
                </div>
              </div>
              {showOne ? (
                <div className="space-y-1">
                  <Label htmlFor={`${k}-one`} className="text-xs">{ONE_LABEL}{isTop && <span className="text-destructive"> *</span>}</Label>
                  {ed ? (
                    <Textarea id={`${k}-one`} rows={2} value={e.one_thing ?? ''} onChange={ev => upd(k, { one_thing: ev.target.value })}
                      className={isTop && !e.one_thing?.trim() ? 'border-destructive/60' : ''} />
                  ) : <p className="text-sm text-foreground whitespace-pre-wrap">{e.one_thing || '—'}</p>}
                </div>
              ) : ed && (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => upd(k, { show_one: true })}>
                  <Plus className="h-3 w-3" />Add a ONE Thing (optional)
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Collapsed read-only block for Kristen's admin agent detail. */
export function SevenCirclesCollapsed({ circles }: { circles: Circles }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2"><Lock className="h-4 w-4" />Seven circles (private)</span><ChevronDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3"><SevenCirclesSection circles={circles} editable={false} /></CollapsibleContent>
    </Collapsible>
  );
}
