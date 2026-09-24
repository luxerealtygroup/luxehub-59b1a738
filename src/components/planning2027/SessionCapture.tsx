import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_YEAR } from '@/lib/planning2027';

type Bucket = 'scale' | 'cut' | 'test';
interface LeadSourceRow { bucket: Bucket; source: string; volume: string; budget: string; metric: string }
interface CalRow { quarter: number; market_focus: string; database_touch: string; client_event: string; owner: string }
interface Priority { priority: string; owner: string; due: string }

const BUCKETS: { k: Bucket; label: string; volumeLabel: string }[] = [
  { k: 'scale', label: 'Scale', volumeLabel: 'Leads / month' },
  { k: 'cut', label: 'Cut', volumeLabel: 'End date' },
  { k: 'test', label: 'Test', volumeLabel: 'Leads / month' },
];
const emptyCal = (): CalRow[] => [1, 2, 3, 4].map(q => ({ quarter: q, market_focus: '', database_touch: '', client_event: '', owner: '' }));

/** Filled in live during the Oct 14 session. Admins/owners only (enforced by database rules). */
export function SessionCapture({ orgId }: { orgId: string | null }) {
  const [id, setId] = useState<string | null>(null);
  const [sources, setSources] = useState<LeadSourceRow[]>([]);
  const [cal, setCal] = useState<CalRow[]>(emptyCal());
  const [pri, setPri] = useState<Priority[]>([{ priority: '', owner: '', due: '' }, { priority: '', owner: '', due: '' }, { priority: '', owner: '', due: '' }]);
  const [resp, setResp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('planning_session_capture' as any).select('*').eq('plan_year', PLAN_YEAR).maybeSingle().then(({ data }) => {
      const d = data as any;
      if (d) {
        setId(d.id); setSources(d.lead_sources ?? []); setCal(d.marketing_calendar?.length ? d.marketing_calendar : emptyCal());
        if (d.q1_priorities?.length) setPri(d.q1_priorities); setResp(d.response_time_minutes ?? null);
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!orgId) { toast.error('No brokerage selected'); return; }
    setBusy(true);
    const payload = { org_id: orgId, plan_year: PLAN_YEAR, lead_sources: sources.filter(s => s.source.trim()), marketing_calendar: cal, q1_priorities: pri, response_time_minutes: resp };
    const { data, error } = await supabase.from('planning_session_capture' as any).upsert(payload, { onConflict: 'org_id,plan_year' }).select('id').single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setId((data as any).id); toast.success('Session notes saved');
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x));

  return (
    <div className="space-y-4">
      {BUCKETS.map(b => {
        const rows = sources.map((s, i) => ({ s, i })).filter(x => x.s.bucket === b.k);
        return (
          <Card key={b.k}><CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">{b.label} — lead sources</CardTitle>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setSources([...sources, { bucket: b.k, source: '', volume: '', budget: '', metric: '' }])}><Plus className="h-4 w-4" />Add</Button>
          </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
              {rows.map(({ s, i }) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] gap-2 rounded-md border sm:border-0 border-border p-2 sm:p-0">
                  <Input aria-label="Source" placeholder="Source" value={s.source} onChange={e => setSources(upd(sources, i, { source: e.target.value }))} />
                  <Input aria-label={b.volumeLabel} placeholder={b.volumeLabel} type={b.k === 'cut' ? 'date' : 'text'} value={s.volume} onChange={e => setSources(upd(sources, i, { volume: e.target.value }))} />
                  <Input aria-label="Budget" placeholder="Budget" value={s.budget} onChange={e => setSources(upd(sources, i, { budget: e.target.value }))} />
                  <Input aria-label="Success metric" placeholder="Success metric" value={s.metric} onChange={e => setSources(upd(sources, i, { metric: e.target.value }))} />
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setSources(sources.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">{PLAN_YEAR} marketing calendar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cal.map((c, i) => (
            <div key={c.quarter} className="grid grid-cols-1 sm:grid-cols-[3rem_1fr_1fr_1fr_1fr] gap-2 items-center rounded-md border sm:border-0 border-border p-2 sm:p-0">
              <span className="font-semibold text-foreground">Q{c.quarter}</span>
              <Input aria-label={`Q${c.quarter} market focus`} placeholder="Market focus" value={c.market_focus} onChange={e => setCal(upd(cal, i, { market_focus: e.target.value }))} />
              <Input aria-label={`Q${c.quarter} database touch`} placeholder="Database touch" value={c.database_touch} onChange={e => setCal(upd(cal, i, { database_touch: e.target.value }))} />
              <Input aria-label={`Q${c.quarter} client event`} placeholder="Client event" value={c.client_event} onChange={e => setCal(upd(cal, i, { client_event: e.target.value }))} />
              <Input aria-label={`Q${c.quarter} owner`} placeholder="Owner" value={c.owner} onChange={e => setCal(upd(cal, i, { owner: e.target.value }))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Q1 top three priorities</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pri.map((p, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_10rem] gap-2 rounded-md border sm:border-0 border-border p-2 sm:p-0">
              <Input aria-label={`Priority ${i + 1}`} placeholder={`Priority ${i + 1}`} value={p.priority} onChange={e => setPri(upd(pri, i, { priority: e.target.value }))} />
              <Input aria-label={`Priority ${i + 1} owner`} placeholder="Owner" value={p.owner} onChange={e => setPri(upd(pri, i, { owner: e.target.value }))} />
              <Input aria-label={`Priority ${i + 1} due date`} type="date" value={p.due} onChange={e => setPri(upd(pri, i, { due: e.target.value }))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card><CardContent className="p-4 sm:p-6 flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label htmlFor="resp">First-contact response time target</Label>
          <div className="relative w-40"><Input id="resp" type="number" className="pr-16" value={resp ?? ''} onChange={e => setResp(e.target.value === '' ? null : Number(e.target.value))} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">minutes</span></div></div>
        <Button onClick={save} disabled={busy} className="gap-2 ml-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save session notes</Button>
      </CardContent></Card>
    </div>
  );
}
