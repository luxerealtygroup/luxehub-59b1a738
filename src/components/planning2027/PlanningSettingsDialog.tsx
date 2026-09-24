import { DealFlagsEditor } from './DealFlagsEditor';
import { setDealWeightConfig } from '@/lib/utils/dealWeight';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calculator } from 'lucide-react';
import { PlanningSettings } from '@/lib/planning2027';
import { useTeamActuals } from './useTeamActuals';

function TeamDefaultsCalc({ ids, onApply }: { ids: string[]; onApply: (d: Partial<PlanningSettings>, note: string) => void }) {
  const t = useTeamActuals(ids);
  const d = t.totals.defaults;
  return (
    <div className="col-span-2 rounded-md border border-gold/40 bg-gold/5 p-3 text-sm space-y-2">
      {t.probes}
      {t.loading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding up 2026 data for {ids.length} agents…</p> : <>
        <p className="font-medium text-foreground">From the team's 2026 Follow Up Boss and 4-1-1 data:</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>Avg sale price: <b className="text-foreground">{d.avg_sale_price?.toLocaleString() ?? '—'}</b> ({t.totals.sales} sales, ${Math.round(t.totals.volume).toLocaleString()} volume)</li>
          <li>Commission: <b className="text-foreground">{d.commission_rate ?? '—'}%</b> (sales GCI ÷ volume)</li>
          <li>Appt → close: <b className="text-foreground">{d.appt_to_close_rate ?? '—'}%</b> ({t.totals.closings} closings ÷ {t.totals.appts} appointments)</li>
          <li>Lead → appt: <b className="text-foreground">{d.lead_to_appt_rate ?? '—'}%</b> ({t.totals.appts} appointments ÷ {t.totals.leads} leads)</li>
          <li>Agent split is not in Follow Up Boss — set it by hand.</li>
        </ul>
        <Button size="sm" variant="outline" onClick={() => onApply(Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) as any,
          `Calculated from 2026 team data (${ids.length} agents, ${t.totals.sales} sales, ${t.totals.appts} appts, ${t.totals.leads} leads)`)}>Use these numbers</Button>
      </>}
    </div>
  );
}

/** datetime-local value in Toronto time <-> ISO */
function toTorontoLocal(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function fromTorontoLocal(local: string) {
  const guess = new Date(`${local}:00Z`);
  const shown = new Date(toTorontoLocal(guess.toISOString()) + ':00Z');
  return new Date(guess.getTime() + (guess.getTime() - shown.getTime())).toISOString();
}

export function PlanningSettingsDialog({ open, onOpenChange, orgId, settings, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; orgId: string | null; settings: PlanningSettings; onSaved: () => void;
}) {
  const [f, setF] = useState(settings);
  const [deadline, setDeadline] = useState(toTorontoLocal(settings.submission_deadline));
  const [lock, setLock] = useState(toTorontoLocal(settings.final_lock_at || settings.submission_deadline));
  const [busy, setBusy] = useState(false);
  const [calc, setCalc] = useState(false);
  const [team, setTeam] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  useEffect(() => { if (open) { setF(settings); setDeadline(toTorontoLocal(settings.submission_deadline)); setLock(toTorontoLocal(settings.final_lock_at || settings.submission_deadline)); setCalc(false); } }, [open, settings]);
  useEffect(() => { if (open) supabase.rpc('get_team_agents').then(({ data }) => setTeam((data as any[]) ?? [])); }, [open]);
  const ids = f.selling_agent_ids ?? [];

  const num = (k: keyof PlanningSettings, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`s-${k}`} className="text-xs">{label}</Label>
      <Input id={`s-${k}`} type="number" step="any" value={f[k] as number}
        onChange={e => setF({ ...f, [k]: Number(e.target.value) })} />
    </div>
  );

  const save = async () => {
    if (!orgId) return;
    setBusy(true);
    const { error } = await supabase.from('planning_settings').upsert({
      org_id: orgId, plan_year: f.plan_year,
      commission_rate: f.commission_rate, agent_split_pct: f.agent_split_pct,
      appt_to_close_rate: f.appt_to_close_rate, lead_to_appt_rate: f.lead_to_appt_rate,
      avg_sale_price: f.avg_sale_price, selling_agent_ids: ids, defaults_source: f.defaults_source ?? null,
      submission_deadline: fromTorontoLocal(deadline), planning_session_date: f.planning_session_date,
      final_lock_at: fromTorontoLocal(lock),
      lease_full_unit_gci: f.lease_full_unit_gci ?? 4000, lease_weight: f.lease_weight ?? 0.3333,
    }, { onConflict: 'org_id,plan_year' });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setDealWeightConfig({ leaseFullUnitGci: f.lease_full_unit_gci, leaseWeight: f.lease_weight });
    toast.success('Planning settings saved — reload to recount deals with the new lease rule');
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>2027 planning settings</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{f.defaults_source || 'Default rates have not been calculated from team data yet.'}</p>
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setCalc(true)} disabled={!ids.length}><Calculator className="h-4 w-4" />Calculate from 2026 data</Button>
          </div>
          {calc && <TeamDefaultsCalc ids={ids} onApply={(d, note) => { setF(x => ({ ...x, ...d, defaults_source: note })); setCalc(false); }} />}
          {num('agent_split_pct', 'Team agent split %')}
          {num('appt_to_close_rate', 'Appointment → close %')}
          {num('lead_to_appt_rate', 'Lead → appointment %')}
          {num('avg_sale_price', 'Avg sale price ($)')}
          {num('commission_rate', 'Commission %')}
          {num('lease_full_unit_gci', 'Lease counts as a full unit at GCI of ($)')}
          {num('lease_weight', 'Lease weight under that GCI (units)')}
          <p className="col-span-2 text-[11px] text-muted-foreground -mt-1">Sale = 1 unit. Lease under the GCI threshold = lease weight (0.3333 = ⅓). Lease at or above it = 1 unit. GCI always counts in full. Applies across the whole app.</p>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label htmlFor="s-deadline" className="text-xs">Draft deadline (Toronto time)</Label>
            <Input id="s-deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label htmlFor="s-session" className="text-xs">Planning session date</Label>
            <Input id="s-session" type="date" value={f.planning_session_date} onChange={e => setF({ ...f, planning_session_date: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label htmlFor="s-lock" className="text-xs">Goals lock (Toronto time)</Label>
            <Input id="s-lock" type="datetime-local" value={lock} onChange={e => setLock(e.target.value)} />
          </div>
          <DealFlagsEditor orgId={orgId} />
          <div className="col-span-2 space-y-2">
            <Label className="text-xs">Selling agents (counted in submissions and team totals)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-md border border-border p-2">
              {team.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm py-1">
                  <Checkbox checked={ids.includes(a.id)} onCheckedChange={c => setF(x => ({ ...x, selling_agent_ids: c ? [...ids, a.id] : ids.filter(i => i !== a.id) }))} />
                  <span className="break-words min-w-0">{a.full_name || a.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
