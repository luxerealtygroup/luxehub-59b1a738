import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Lock, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/utils';

type Row = { id: string; org_id: string; draft: any; facts: any; generated_at: string | null; owner_notes: Record<string, string>; owner_notes_updated_at: string | null };
const m = (v: any) => (v == null ? '—' : formatCurrency(Number(v)));
const n = (v: any) => (v == null ? '—' : formatNumber(Number(v)));

const List = ({ items }: { items?: any[] }) => !items?.length ? <p className="text-sm text-muted-foreground">Nothing in the draft.</p> : (
  <ul className="space-y-1.5 text-sm text-foreground list-disc pl-5">
    {items.map((x, i) => <li key={i} className="break-words">{typeof x === 'string' ? x : <><span className="font-medium">{x.point ?? x.issue}</span>{x.evidence && <span className="text-muted-foreground"> — {x.evidence}</span>}</>}</li>)}
  </ul>
);
const H = ({ children }: { children: React.ReactNode }) => <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{children}</p>;

function NotesBox({ value, onSave, label }: { value: string; onSave: (v: string) => Promise<void>; label: string }) {
  const [v, setV] = useState(value); const [busy, setBusy] = useState(false);
  useEffect(() => setV(value), [value]);
  return (
    <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
      <H>{label}</H>
      <Textarea value={v} onChange={e => setV(e.target.value)} rows={3} placeholder="Your own notes — saved separately from the draft." />
      <Button size="sm" variant="outline" className="gap-2" disabled={busy || v === value} onClick={async () => { setBusy(true); await onSave(v); setBusy(false); }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save my notes
      </Button>
    </div>
  );
}

export function OwnerCoachingNotes() {
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const poll = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data: cp } = await supabase.from('company_plans').select('id').maybeSingle();
    setAllowed(!!cp);
    if (!cp) return;
    const { data } = await supabase.from('owner_coaching_notes').select('*').eq('plan_year', 2027).maybeSingle();
    setRow((data as any) ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);
  const generating = !!row?.draft?.generating;
  useEffect(() => {
    if (generating && !poll.current) poll.current = window.setInterval(load, 8000);
    if (!generating && poll.current) { clearInterval(poll.current); poll.current = null; }
    return () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  }, [generating, load]);

  const regenerate = async () => {
    setStarting(true);
    const { data, error } = await supabase.functions.invoke('owner-coaching-notes', { body: {} });
    setStarting(false);
    const msg = (data as any)?.error || error?.message;
    if (msg) { toast.error(msg); return; }
    toast.info('Compiling — this takes a couple of minutes.');
    load();
  };

  const saveNote = async (key: string, v: string) => {
    if (!row) return;
    const next = { ...(row.owner_notes ?? {}), [key]: v };
    const { error } = await supabase.from('owner_coaching_notes').update({ owner_notes: next }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Notes saved'); setRow({ ...row, owner_notes: next });
  };

  if (allowed === false) return null; // not the Company Plan owner — RLS returns nothing anyway
  if (row === undefined || allowed === null) return null;

  const t = row?.draft?.team; const f = row?.facts; const errs: string[] = row?.draft?.errors ?? [];
  const stamp = row?.generated_at ? new Date(row.generated_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <Card className="border-gold/40">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg font-display">Coaching Notes for Kristen</CardTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1"><Lock className="h-3.5 w-3.5" />Owner-only. Agents, staff and other admins can't see this.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {generating ? 'Compiling a fresh draft…' : stamp ? `Draft — generated on ${stamp}` : 'No draft yet.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={starting || generating} className="gap-2">
            {starting || generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{row?.generated_at ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {errs.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{errs.join(' · ')}</div>}
        {t && f && (
          <section className="space-y-5">
            <h3 className="font-display text-base font-semibold">Team</h3>
            <div><H>Top 5 takeaways from 2026</H><ol className="list-decimal pl-5 space-y-1.5 text-sm">{(t.takeaways ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ol></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3"><H>What's working — protect it</H><List items={t.working} /></div>
              <div className="rounded-lg border border-border p-3"><H>What's not — fix it</H><List items={t.not_working} /></div>
            </div>
            <div>
              <H>Data and system hygiene</H>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-2">Issue</th><th className="p-2">Evidence</th><th className="p-2">Fix</th><th className="p-2">Owner</th></tr></thead>
                  <tbody>{(t.hygiene ?? []).map((x: any, i: number) => (
                    <tr key={i} className="border-t border-border align-top"><td className="p-2 font-medium">{x.issue}</td><td className="p-2 text-muted-foreground">{x.evidence}</td><td className="p-2">{x.fix}</td><td className="p-2 whitespace-nowrap">{x.owner}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div>
              <H>Lead sources — FUB 2026</H>
              <div className="rounded-lg border border-border overflow-x-auto mb-3">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-2">Source</th><th className="p-2 text-right">Leads</th><th className="p-2 text-right">Closings</th><th className="p-2 text-right">Lead→close</th><th className="p-2 text-right">GCI</th></tr></thead>
                  <tbody>{(f.lead_sources ?? []).map((s: any) => (
                    <tr key={s.source} className="border-t border-border"><td className="p-2">{s.source}</td><td className="p-2 text-right">{n(s.leads)}</td><td className="p-2 text-right">{n(s.closings)}</td><td className="p-2 text-right">{s.lead_to_close_pct == null ? '—' : `${s.lead_to_close_pct}%`}</td><td className="p-2 text-right">{m(s.gci)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{f.lead_source_note}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['scale', 'cut', 'test'] as const).map(k => <div key={k} className="rounded-lg border border-border p-3"><H>{k}</H><List items={t.lead_sources?.[k]} /></div>)}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3"><H>Recruiting — need vs in motion</H><p className="text-sm">{t.recruiting}</p></div>
            <div><H>Five talking points for Oct 14</H><ol className="list-decimal pl-5 space-y-1.5 text-sm">{(t.talking_points ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ol></div>
            <NotesBox label="My notes — team" value={row?.owner_notes?.team ?? ''} onSave={v => saveNote('team', v)} />
          </section>
        )}

        {f?.agents?.length > 0 && (
          <section className="space-y-4">
            <h3 className="font-display text-base font-semibold">Per agent</h3>
            {f.agents.map((a: any) => {
              const d = row?.draft?.agents?.[a.id]; const x = a.numbers; const act = a.activity;
              return (
                <div key={a.id} className="rounded-lg border border-border p-4 space-y-4">
                  <p className="font-display text-lg font-semibold">{a.name}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {[['GCI', m(x.gci)], ['Homes', n(x.homes)], ['Leases', n(x.leases)], ['Volume', m(x.volume)], ['Best month', x.best_month ?? '—'],
                      ['Goal vs actual', x.goal_gci ? `${Math.round((x.gci / x.goal_gci) * 100)}% of ${m(x.goal_gci)}` : 'No 2026 goal']].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-muted/30 p-2 min-w-0"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p><p className="text-sm font-semibold break-words">{v}</p></div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">4-1-1: {act.weeks_logged} of {act.weeks_elapsed} weeks logged · {n(act.conversations)} conversations · {n(act.pipeline_adds)} pipeline adds · priorities done {act.priorities_done}/{act.priorities} · {act.coaching_sessions} coaching sessions</p>
                  {!d ? <p className="text-sm text-muted-foreground">No AI draft for this agent — try Regenerate.</p> : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div><H>Strengths</H><List items={d.strengths} /></div>
                      <div>
                        <H>Patterns</H>
                        <p className="text-xs font-medium mt-1">Stuck</p><List items={d.patterns?.stuck} />
                        <p className="text-xs font-medium mt-2">Carried over week to week</p><List items={d.patterns?.carried_over} />
                        <p className="text-xs font-medium mt-2">Activity gaps</p><List items={d.patterns?.activity_gaps} />
                      </div>
                      <div><H>What to coach in 2027</H><List items={d.coach_2027} /></div>
                      <div><H>Three questions for the Oct planning / first 1:1</H><List items={d.questions} /></div>
                      {d.suggested_range && (
                        <div className="lg:col-span-2 rounded-md border border-dashed border-gold/60 p-3">
                          <H>Suggested 2027 range — a suggestion only</H>
                          <p className="text-sm font-semibold">{n(d.suggested_range.deals_low)}–{n(d.suggested_range.deals_high)} deals · {m(d.suggested_range.gci_low)}–{m(d.suggested_range.gci_high)} GCI</p>
                          <p className="text-xs text-muted-foreground mt-1">{d.suggested_range.rationale}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <NotesBox label={`My notes — ${a.name}`} value={row?.owner_notes?.[a.id] ?? ''} onSave={v => saveNote(a.id, v)} />
                </div>
              );
            })}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
