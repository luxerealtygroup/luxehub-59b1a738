import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlanningSettings } from '@/lib/planning2027';

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
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(settings); setDeadline(toTorontoLocal(settings.submission_deadline)); } }, [open, settings]);

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
      avg_sale_price: f.avg_sale_price,
      submission_deadline: fromTorontoLocal(deadline), planning_session_date: f.planning_session_date,
    }, { onConflict: 'org_id,plan_year' });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Planning settings saved');
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>2027 planning settings</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {num('avg_sale_price', 'Default avg sale price ($)')}
          {num('commission_rate', 'Default commission %')}
          {num('agent_split_pct', 'Default agent split %')}
          {num('appt_to_close_rate', 'Default appt → close %')}
          {num('lead_to_appt_rate', 'Default lead → appt %')}
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label htmlFor="s-deadline" className="text-xs">Deadline (Toronto time)</Label>
            <Input id="s-deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label htmlFor="s-session" className="text-xs">Planning session date</Label>
            <Input id="s-session" type="date" value={f.planning_session_date} onChange={e => setF({ ...f, planning_session_date: e.target.value })} />
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
