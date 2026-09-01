import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { blockPortalWrite } from '@/hooks/usePortalPreview';
import {
  KEY_DATE_KINDS,
  KeyDateKind,
  PortalKeyDate,
  formatEventTime,
  keyDateLabel,
} from '@/lib/portalKeyDates';

interface Props {
  portalId: string;
  propertyId: string;
}

/** Agent entry of extra portal dates (inspection, open house, other) with time. */
export function PortalKeyDatesEditor({ portalId, propertyId }: Props) {
  const { toast } = useToast();
  const [dates, setDates] = useState<PortalKeyDate[]>([]);
  const [kind, setKind] = useState<KeyDateKind>('inspection');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('portal_key_dates')
      .select('*')
      .eq('property_id', propertyId)
      .order('event_date', { ascending: true });
    setDates((data ?? []) as PortalKeyDate[]);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (blockPortalWrite()) return;
    if (!date) {
      toast({ title: 'Pick a date first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('portal_key_dates').insert({
      portal_id: portalId,
      property_id: propertyId,
      kind,
      custom_label: label.trim() || null,
      event_date: date,
      event_time: time || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not add date', description: error.message, variant: 'destructive' });
      return;
    }
    setLabel('');
    setDate('');
    setTime('');
    void load();
  };

  const remove = async (id: string) => {
    if (blockPortalWrite()) return;
    const { error } = await supabase.from('portal_key_dates').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not remove date', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const toggleInternal = async (d: PortalKeyDate) => {
    if (blockPortalWrite()) return;
    const { error } = await supabase
      .from('portal_key_dates')
      .update({ is_internal: !d.is_internal })
      .eq('id', d.id);
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Other important dates</Label>
      </div>

      {dates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Conditions and closing already show automatically. Add inspections, open houses or anything else here.
        </p>
      )}

      <ul className="space-y-2">
        {dates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{keyDateLabel(d)}</p>
              <p className="text-xs text-muted-foreground">
                {d.event_date}
                {formatEventTime(d.event_time) ? ` · ${formatEventTime(d.event_time)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={!d.is_internal} onCheckedChange={() => toggleInternal(d)} />
                <span className="text-xs text-muted-foreground">{d.is_internal ? 'Internal' : 'Client sees'}</span>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(d.id)} title="Remove date">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-5 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as KeyDateKind)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KEY_DATE_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Label (optional)</Label>
          <Input className="h-9" value={label} placeholder="e.g. Buyer walkthrough" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input className="h-9" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Time (optional)</Label>
          <Input className="h-9" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Button size="sm" className="gap-2" disabled={saving} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add date
        </Button>
      </div>
    </div>
  );
}
