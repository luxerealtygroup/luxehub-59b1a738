import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Sparkles, Plus, Trash2, RotateCcw } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  PreworkRow, RecapRow, GoalResults, perWeek, pctChange, splitQuarters, LeadSourceFocus, ActionItem, Milestone,
} from '@/lib/planning2027';
import type { PriorYearActuals, PriorYearGoal } from './usePriorYearActuals';

type SetPrework = (fn: (p: PreworkRow) => PreworkRow) => void;
const m = (v: number | null | undefined) => (v == null ? '—' : formatCurrency(v));
const n = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg sm:text-xl font-bold text-foreground break-words">{value}</p>
      {sub && <p className="text-xs text-muted-foreground break-words">{sub}</p>}
    </div>
  );
}

function Field({ id, label, value, onChange, editable, rows = 4, hint }: {
  id: string; label: string; value: string | null | undefined; onChange: (v: string) => void; editable: boolean; rows?: number; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {editable ? (
        <Textarea id={id} rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} />
      ) : (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap break-words min-h-[2.5rem]">{value || '—'}</p>
      )}
    </div>
  );
}

/* ─────────────── TAB 1 — 2026 Recap ─────────────── */
export function RecapSection({ agentId, actuals, goal2026, recap, recapLoading, regenerating, canRegenerate, onRegenerate, prework, setPrework, editable }: {
  agentId: string; actuals: PriorYearActuals; goal2026: PriorYearGoal | null;
  recap: RecapRow | null; recapLoading: boolean; regenerating: boolean; canRegenerate: boolean; onRegenerate: () => void;
  prework: PreworkRow; setPrework?: SetPrework; editable: boolean;
}) {
  const [ref, setRef] = useState<{ reflections: any[]; quarterly: any[] } | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from('business_planning_reflections').select('quarter, wins_ytd, biggest_bottleneck, what_avoiding, confidence, stress').eq('user_id', agentId).eq('year', 2026).order('quarter'),
      supabase.from('planning_assumptions').select('quarter, quarterly_goal, fallout_rate').eq('user_id', agentId).eq('year', 2026).order('quarter'),
    ]).then(([r, q]) => setRef({ reflections: r.data ?? [], quarterly: q.data ?? [] }));
  }, [agentId]);

  const vsGoal = (actual: number, goal: number | null | undefined, money = false) =>
    goal ? `Goal ${money ? m(goal) : n(goal)} · ${Math.round((actual / goal) * 100)}%` : 'No 2026 goal set';

  const recapFields: [keyof PreworkRow, keyof RecapRow, string][] = [
    ['recap_wins', 'wins', 'What went right in 2026'],
    ['recap_challenges', 'challenges', 'Recurring challenges and themes'],
    ['recap_commitments', 'commitments', 'Commitments made in coaching — did they stick?'],
    ['recap_lead_sources', 'lead_sources', 'Top lead sources'],
  ];

  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">2026 production <span className="font-normal text-muted-foreground text-sm">· Follow Up Boss</span></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {actuals.loading ? <Loader2 className="h-5 w-5 animate-spin text-gold" /> : <>
            <Stat label="Closed deals" value={n(actuals.closings)} sub={vsGoal(actuals.closings, goal2026?.deals)} />
            <Stat label="Volume" value={m(actuals.volume)} sub={vsGoal(actuals.volume, goal2026?.volume, true)} />
            <Stat label="GCI" value={m(actuals.gci)} sub={vsGoal(actuals.gci, goal2026?.gci, true)} />
            <Stat label="Avg sale price" value={actuals.closedSales ? m(Math.round(actuals.volume / actuals.closedSales)) : '—'} sub={`${actuals.closedSales} sales`} />
          </>}
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">2026 activity <span className="font-normal text-muted-foreground text-sm">· weekly 4-1-1 ({actuals.weeksLogged} weeks logged)</span></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <Stat label="Conversations" value={n(actuals.conversations)} />
          <Stat label="Appointments" value={n(actuals.appointments)} />
          <Stat label="Listings taken" value={n(actuals.listings)} />
          <Stat label="Offers" value={n(actuals.offers)} />
          <Stat label="Leads" value={n(actuals.leads)} />
          <Stat label="Lead → appt" value={pct(actuals.leadToApptRaw)} />
          <Stat label="Appt → close" value={pct(actuals.apptToCloseRaw)} />
        </CardContent>
      </Card>

      <Card className="border-gold/40">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" />Weekly coaching summary</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <Badge variant="outline" className="mr-2 border-gold/50 text-gold">Draft — compiled from your weekly coaching</Badge>
              {recap && `${recap.source_counts?.coaching_sessions ?? 0} coaching sessions · ${recap.source_counts?.weekly_entries ?? 0} weekly check-ins`}
            </p>
          </div>
          {canRegenerate && (
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating} className="gap-2">
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Regenerate
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {recapLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-gold" />Compiling your coaching notes…</p>
          ) : !recap ? (
            <p className="text-sm text-muted-foreground">No coaching summary yet.</p>
          ) : recapFields.map(([pk, rk, label]) => (
            <Field key={pk} id={pk} label={label} editable={editable && !!setPrework}
              value={(prework[pk] as string) ?? (recap[rk] as string)}
              onChange={v => setPrework?.(p => ({ ...p, [pk]: v }))} rows={5} />
          ))}
          {editable && recap && <p className="text-xs text-muted-foreground">Edit or add to anything above — your version is saved with your plan.</p>}
        </CardContent>
      </Card>

      {ref && (ref.reflections.length > 0 || ref.quarterly.length > 0) && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">For reference: your earlier 2026 planning</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ref.quarterly.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ref.quarterly.map(q => <Badge key={q.quarter} variant="secondary">Q{q.quarter} goal: {n(q.quarterly_goal)} deals</Badge>)}
              </div>
            )}
            {ref.reflections.map(r => (
              <div key={r.quarter} className="rounded-md border border-border p-3 space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Q{r.quarter} reflection</p>
                {r.wins_ytd && <p><span className="text-muted-foreground">Wins: </span>{r.wins_ytd}</p>}
                {r.biggest_bottleneck && <p><span className="text-muted-foreground">Bottleneck: </span>{r.biggest_bottleneck}</p>}
                {r.what_avoiding && <p><span className="text-muted-foreground">Avoiding: </span>{r.what_avoiding}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─────────────── TAB 2 — Reflection ─────────────── */
export function ReflectionSection({ prework, setPrework, editable }: { prework: PreworkRow; setPrework?: SetPrework; editable: boolean }) {
  const fields: [keyof PreworkRow, string, string?][] = [
    ['wins_2026', 'What were your biggest wins in 2026?', 'Started from your coaching recap — make it yours.'],
    ['challenges_2026', 'What were your biggest challenges in 2026?', 'Started from your coaching recap — make it yours.'],
    ['top_lead_sources', 'What were your top lead sources?'],
    ['team_change_suggestion', 'One change you would suggest for the team'],
    ['stop_start_continue', 'What do you want to stop, start and continue in 2027?'],
    ['support_needed', 'What support do you need from Kristen and the team?'],
  ];
  return (
    <Card><CardContent className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {fields.map(([k, label, hint]) => (
        <Field key={k} id={k} label={label} hint={editable ? hint : undefined} editable={editable && !!setPrework}
          value={prework[k] as string} onChange={v => setPrework?.(p => ({ ...p, [k]: v }))} />
      ))}
    </CardContent></Card>
  );
}

/* ─────────────── TAB 3 — 2026 vs 2027 ─────────────── */
export function GoalComparison({ actuals, r }: { actuals: PriorYearActuals; r: GoalResults }) {
  const rows: [string, number, number | null, boolean][] = [
    ['GCI', actuals.gci, r.gci_goal, true],
    ['Deals', actuals.closings, r.deals_needed, false],
    ['Volume', actuals.volume, r.volume_needed, true],
    ['Appointments', actuals.appointments, r.appointments_needed, false],
    ['Leads', actuals.leads, r.leads_needed, false],
  ];
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">2026 actual vs 2027 goal</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="hidden sm:grid grid-cols-4 gap-2 text-xs uppercase tracking-wider text-muted-foreground px-3">
          <span /> <span className="text-right">2026 actual</span><span className="text-right">2027 goal</span><span className="text-right">Change</span>
        </div>
        {rows.map(([label, a, g, money]) => {
          const c = pctChange(a, g);
          return (
            <div key={label} className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium text-foreground col-span-2 sm:col-span-1">{label}</span>
              <span className="sm:text-right"><span className="sm:hidden text-muted-foreground">2026: </span>{money ? m(a) : n(a)}</span>
              <span className="text-right sm:text-right"><span className="sm:hidden text-muted-foreground">2027: </span><span className="font-semibold">{money ? m(g) : n(g)}</span></span>
              <span className={`col-span-2 sm:col-span-1 text-right font-semibold ${c == null ? 'text-muted-foreground' : c >= 0 ? 'text-success' : 'text-destructive'}`}>
                {c == null ? '—' : `${c > 0 ? '+' : ''}${formatNumber(c)}%`}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ─────────────── TAB 4 — Way Forward ─────────────── */
export function weeklyDefaults(r: GoalResults | null, a: PriorYearActuals) {
  const appts = perWeek(r?.appointments_needed ?? null);
  const leads = perWeek(r?.leads_needed ?? null);
  const ratio = a.appointments > 0 && a.conversations > 0 ? a.conversations / a.appointments : null;
  const convos = appts != null && ratio ? Math.ceil(appts * ratio) : leads;
  return { weekly_conversations: convos, weekly_appointments: appts, weekly_leads: leads };
}

export function WayForwardSection({ prework, setPrework, editable, results, actuals }: {
  prework: PreworkRow; setPrework?: SetPrework; editable: boolean; results: GoalResults | null; actuals: PriorYearActuals;
}) {
  const ed = editable && !!setPrework;
  const set = (patch: Partial<PreworkRow>) => setPrework?.(p => ({ ...p, ...patch }));
  const sources: LeadSourceFocus[] = prework.lead_source_focus?.length ? prework.lead_source_focus : [{ source: '', pct: null }, { source: '', pct: null }, { source: '', pct: null }];
  const ms: Milestone[] = prework.quarterly_milestones?.length ? prework.quarterly_milestones : splitQuarters(results?.deals_needed ?? null, results?.gci_goal ?? null);
  const actions: ActionItem[] = prework.action_plan?.length ? prework.action_plan : [{ action: '', due: '' }, { action: '', due: '' }, { action: '', due: '' }];
  const pctTotal = sources.reduce((s, x) => s + (x.pct ?? 0), 0);
  const msTotals = ms.reduce((t, q) => ({ d: t.d + (q.deals ?? 0), g: t.g + (q.gci ?? 0) }), { d: 0, g: 0 });
  const numIn = (id: string, v: number | null | undefined, on: (x: number | null) => void, prefix?: string) => ed ? (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
      <Input id={id} type="number" inputMode="numeric" className={prefix ? 'pl-6' : ''} value={v ?? ''} onChange={e => on(e.target.value === '' ? null : Number(e.target.value))} />
    </div>
  ) : <p className="font-semibold text-foreground">{prefix ? m(v) : n(v)}</p>;

  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Weekly activity commitments</CardTitle>
        {ed && <Button size="sm" variant="ghost" className="gap-2" onClick={() => set(weeklyDefaults(results, actuals))}><RotateCcw className="h-4 w-4" />Reset from calculator</Button>}
      </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([['weekly_conversations', 'Conversations / week'], ['weekly_appointments', 'Appointments / week'], ['weekly_leads', 'Leads / week']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1"><Label htmlFor={k} className="text-xs">{label}</Label>{numIn(k, prework[k], v => set({ [k]: v }))}</div>
          ))}
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top 3 lead sources for 2027</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {sources.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem] gap-2 items-center">
              {ed ? <Input aria-label={`Lead source ${i + 1}`} placeholder={`Lead source ${i + 1}`} value={s.source}
                onChange={e => set({ lead_source_focus: sources.map((x, j) => j === i ? { ...x, source: e.target.value } : x) })} />
                : <p className="text-sm text-foreground break-words">{s.source || '—'}</p>}
              {ed ? <div className="relative"><Input aria-label={`Target percent ${i + 1}`} type="number" className="pr-7" value={s.pct ?? ''}
                onChange={e => set({ lead_source_focus: sources.map((x, j) => j === i ? { ...x, pct: e.target.value === '' ? null : Number(e.target.value) } : x) })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
                : <p className="text-right font-semibold">{pct(s.pct)}</p>}
            </div>
          ))}
          <p className={`text-xs ${pctTotal > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>Total: {pctTotal}% of 2027 business</p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Quarterly milestones 2027</CardTitle>
        {ed && <Button size="sm" variant="ghost" className="gap-2" onClick={() => set({ quarterly_milestones: splitQuarters(results?.deals_needed ?? null, results?.gci_goal ?? null) })}><RotateCcw className="h-4 w-4" />Split evenly</Button>}
      </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ms.map((q, i) => (
            <div key={q.quarter} className="rounded-lg border border-border p-3 space-y-2 min-w-0">
              <p className="text-sm font-semibold text-foreground">Q{q.quarter}</p>
              <div className="space-y-1"><Label className="text-xs" htmlFor={`q${q.quarter}d`}>Deals</Label>
                {numIn(`q${q.quarter}d`, q.deals, v => set({ quarterly_milestones: ms.map((x, j) => j === i ? { ...x, deals: v } : x) }))}</div>
              <div className="space-y-1"><Label className="text-xs" htmlFor={`q${q.quarter}g`}>GCI</Label>
                {numIn(`q${q.quarter}g`, q.gci, v => set({ quarterly_milestones: ms.map((x, j) => j === i ? { ...x, gci: v } : x) }), '$')}</div>
            </div>
          ))}
          <p className="col-span-2 lg:col-span-4 text-xs text-muted-foreground">Quarters add up to {n(msTotals.d)} deals · {m(msTotals.g)} (goal: {n(results?.deals_needed)} deals · {m(results?.gci_goal)})</p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">90-day action plan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2 items-center rounded-md sm:rounded-none border sm:border-0 border-border p-2 sm:p-0">
              {ed ? <Input aria-label={`Action ${i + 1}`} placeholder={`Action ${i + 1}`} value={a.action}
                onChange={e => set({ action_plan: actions.map((x, j) => j === i ? { ...x, action: e.target.value } : x) })} />
                : <p className="text-sm text-foreground break-words">{i + 1}. {a.action || '—'}</p>}
              {ed ? <Input aria-label={`Due date ${i + 1}`} type="date" value={a.due}
                onChange={e => set({ action_plan: actions.map((x, j) => j === i ? { ...x, due: e.target.value } : x) })} />
                : <p className="text-sm text-muted-foreground sm:text-right">{a.due ? new Date(`${a.due}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>}
              {ed && <Button variant="ghost" size="icon" aria-label="Remove action" disabled={actions.length <= 3}
                onClick={() => set({ action_plan: actions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
          {ed && actions.length < 5 && <Button variant="outline" size="sm" className="gap-2" onClick={() => set({ action_plan: [...actions, { action: '', due: '' }] })}><Plus className="h-4 w-4" />Add action</Button>}
        </CardContent>
      </Card>

      <Card><CardContent className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field id="skills_focus" label="Skills or training focus" editable={ed} rows={3} value={prework.skills_focus} onChange={v => set({ skills_focus: v })} />
        <Field id="personal_goal" label="One personal goal (optional)" editable={ed} rows={3} value={prework.personal_goal} onChange={v => set({ personal_goal: v })} />
      </CardContent></Card>
    </div>
  );
}
