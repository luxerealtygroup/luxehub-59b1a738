import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCcw } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  Exercises, G_OPTIONS, GName, PROMISE_QUESTIONS, CONTRACT_PROMPTS, KPI_KEYS, KpiKey, PreworkRow, GoalResults, WORKING_WEEKS,
} from '@/lib/planning2027';
import type { PriorYearActuals } from './usePriorYearActuals';

type SetPrework = (fn: (p: PreworkRow) => PreworkRow) => void;

function useEx(prework: PreworkRow, setPrework?: SetPrework) {
  const ex: Exercises = prework.exercises ?? {};
  const set = (patch: Partial<Exercises>) => setPrework?.(p => ({ ...p, exercises: { ...(p.exercises ?? {}), ...patch } }));
  return { ex, set };
}

function Text({ id, label, value, onChange, ed, rows = 3 }: { id: string; label: string; value?: string | null; onChange: (v: string) => void; ed: boolean; rows?: number }) {
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      {ed ? <Textarea id={id} rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} />
        : <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap break-words min-h-[2.5rem]">{value || '—'}</p>}
    </div>
  );
}

function GPicker({ id, label, value, onChange, ed }: { id: string; label: string; value?: GName | null; onChange: (v: GName) => void; ed: boolean }) {
  return (
    <div className="space-y-2 min-w-0">
      <Label id={id}>{label}</Label>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {G_OPTIONS.map(g => (
          <button key={g} type="button" role="radio" aria-checked={value === g} disabled={!ed} onClick={() => onChange(g)}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${value === g ? 'border-gold bg-gold/15 text-foreground' : 'border-border text-muted-foreground hover:border-gold/50'} disabled:cursor-default`}>
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThreeList({ title, k, ex, set, ed }: { title: string; k: 'keep' | 'stop' | 'start'; ex: Exercises; set: (p: Partial<Exercises>) => void; ed: boolean }) {
  const items = [0, 1, 2].map(i => ex[k]?.[i] ?? '');
  return (
    <div className="space-y-2 min-w-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {items.map((v, i) => ed
        ? <Input key={i} aria-label={`${title} ${i + 1}`} placeholder={`${i + 1}.`} value={v} onChange={e => set({ [k]: items.map((x, j) => j === i ? e.target.value : x) })} />
        : <p key={i} className="text-sm text-foreground break-words">{i + 1}. {v || '—'}</p>)}
    </div>
  );
}

/* Reflection tab additions */
export function ReflectionExercises({ prework, setPrework, editable }: { prework: PreworkRow; setPrework?: SetPrework; editable: boolean }) {
  const { ex, set } = useEx(prework, setPrework);
  const ed = editable && !!setPrework;
  const promise = PROMISE_QUESTIONS.map((_, i) => ex.promise?.[i] ?? '');
  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">The four Gs</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <GPicker id="g_carried" label="Which G carried you in 2026?" value={ex.g_carried} onChange={v => set({ g_carried: v })} ed={ed} />
          <GPicker id="g_neglected" label="Which G did you neglect?" value={ex.g_neglected} onChange={v => set({ g_neglected: v })} ed={ed} />
        </CardContent>
      </Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">The promise check</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PROMISE_QUESTIONS.map((q, i) => (
            <Text key={i} id={`promise_${i}`} label={q} ed={ed} value={promise[i]} onChange={v => set({ promise: promise.map((x, j) => j === i ? v : x) })} />
          ))}
        </CardContent>
      </Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Keep / Stop / Start</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ThreeList title="Keep" k="keep" ex={ex} set={set} ed={ed} />
          <ThreeList title="Stop" k="stop" ex={ex} set={set} ed={ed} />
          <ThreeList title="Start" k="start" ex={ex} set={set} ed={ed} />
        </CardContent>
      </Card>
    </div>
  );
}

/* 2027 Goals tab additions */
export function GoalExercises({ prework, setPrework, editable }: { prework: PreworkRow; setPrework?: SetPrework; editable: boolean }) {
  const { ex, set } = useEx(prework, setPrework);
  const ed = editable && !!setPrework;
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Why and how</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Text id="fifth_why" label="My fifth why" ed={ed} value={ex.fifth_why} onChange={v => set({ fifth_why: v })} />
        <Text id="premortem" label="Pre-mortem: the one thing I'll do differently" ed={ed} value={ex.premortem} onChange={v => set({ premortem: v })} />
        <Text id="habit_change" label="One habit to change" ed={ed} rows={2} value={ex.habit_change} onChange={v => set({ habit_change: v })} />
        <Text id="belief_change" label="One belief to change" ed={ed} rows={2} value={ex.belief_change} onChange={v => set({ belief_change: v })} />
      </CardContent>
    </Card>
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Weekly KPI targets derived from the calculator. */
export function kpiDefaults(r: GoalResults | null, a: PriorYearActuals): Record<KpiKey, number | null> {
  const wk = (v: number | null | undefined) => (v == null ? null : r1(v / WORKING_WEEKS));
  const appts = wk(r?.appointments_needed);
  const ratio = a.appointments > 0 && a.conversations > 0 ? a.conversations / a.appointments : null;
  return {
    conversations: appts != null && ratio ? Math.ceil(appts * ratio) : wk(r?.leads_needed),
    pipeline_adds: wk(r?.leads_needed),
    appointments_held: appts,
    agreements_signed: wk(r?.deals_needed),
    deals_closed: wk(r?.deals_needed),
  };
}

/* Way Forward: five KPIs */
export function KpiTargets({ prework, setPrework, editable, results, actuals }: {
  prework: PreworkRow; setPrework?: SetPrework; editable: boolean; results: GoalResults | null; actuals: PriorYearActuals;
}) {
  const { ex, set } = useEx(prework, setPrework);
  const ed = editable && !!setPrework;
  const k = ex.kpis ?? {};
  return (
    <Card><CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
      <div className="min-w-0">
        <CardTitle className="text-base">My five KPIs — weekly targets</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Pre-filled from your 2027 Goals calculator ({WORKING_WEEKS} working weeks). Adjust as needed.</p>
      </div>
      {ed && <Button size="sm" variant="ghost" className="gap-2" onClick={() => set({ kpis: kpiDefaults(results, actuals) })}><RotateCcw className="h-4 w-4" />Reset from calculator</Button>}
    </CardHeader>
      <CardContent className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {KPI_KEYS.map(([key, label]) => (
          <div key={key} className="space-y-1 min-w-0">
            <Label htmlFor={`kpi_${key}`} className="text-xs">{label} / week</Label>
            {ed ? <Input id={`kpi_${key}`} type="number" inputMode="decimal" step="any" value={k[key] ?? ''}
              onChange={e => set({ kpis: { ...k, [key]: e.target.value === '' ? null : Number(e.target.value) } })} />
              : <p className="text-lg font-semibold text-foreground">{k[key] == null ? '—' : formatNumber(k[key]!)}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* Way Forward: contract + lead G */
export function ContractSection({ prework, setPrework, editable, selfId }: { prework: PreworkRow; setPrework?: SetPrework; editable: boolean; selfId: string }) {
  const { ex, set } = useEx(prework, setPrework);
  const ed = editable && !!setPrework;
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!ed) return;
    supabase.rpc('get_team_agents').then(({ data }) =>
      setTeam(((data as any[]) ?? []).filter(a => a.id !== selfId).map(a => ({ id: a.id, name: a.full_name || a.email })).sort((a, b) => a.name.localeCompare(b.name))));
  }, [ed, selfId]);
  const contract = CONTRACT_PROMPTS.map((_, i) => ex.contract?.[i] ?? '');
  return (
    <div className="space-y-4">
      <Card className="border-gold/40"><CardHeader className="pb-2"><CardTitle className="text-base">The 2027 contract</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {CONTRACT_PROMPTS.map((q, i) => (
              <Text key={i} id={`contract_${i}`} label={q} ed={ed} rows={2} value={contract[i]} onChange={v => set({ contract: contract.map((x, j) => j === i ? v : x) })} />
            ))}
          </div>
          <div className="space-y-1 max-w-sm">
            <Label htmlFor="partner">Accountability partner</Label>
            {ed ? (
              <Select value={ex.accountability_partner_id ?? ''} onValueChange={v => set({ accountability_partner_id: v, accountability_partner_name: team.find(t => t.id === v)?.name ?? null })}>
                <SelectTrigger id="partner"><SelectValue placeholder="Pick a teammate" /></SelectTrigger>
                <SelectContent>{team.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : <p className="text-sm font-semibold text-foreground">{ex.accountability_partner_name || '—'}</p>}
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">The G I'll lead 2027 with</CardTitle></CardHeader>
        <CardContent><GPicker id="lead_g" label="Choose one" value={ex.lead_g} onChange={v => set({ lead_g: v })} ed={ed} /></CardContent>
      </Card>
    </div>
  );
}
