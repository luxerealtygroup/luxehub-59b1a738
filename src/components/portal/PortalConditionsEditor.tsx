import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Lock, Plus, StickyNote, Trash2 } from 'lucide-react';
import { blockPortalWrite } from '@/hooks/usePortalPreview';
import {
  CONDITION_TYPES,
  ConditionNote,
  ConditionStatus,
  PARTY_LABEL,
  PortalCondition,
  ResponsibleParty,
  STATUS_LABEL,
  conditionLabel,
  countdownLabel,
  defaultDueDate,
  isOverdue,
  isDueSoon,
  isSettled,
} from '@/lib/portalConditions';

interface Props {
  portalId: string;
  transactionId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Agent/admin editing of a transaction's conditions.
 *
 * Entry is optimised for speed: one click on a type chip logs the condition
 * with a sensible due date and responsible party already filled in.
 */
export function PortalConditionsEditor({ portalId, transactionId }: Props) {
  const { toast } = useToast();
  const [conditions, setConditions] = useState<PortalCondition[]>([]);
  const [notes, setNotes] = useState<Record<string, ConditionNote>>({});
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fail = (error: { message: string } | null) => {
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    return !!error;
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('portal_transaction_conditions')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    const list = (data ?? []) as PortalCondition[];
    setConditions(list);
    if (list.length) {
      const { data: noteRows } = await supabase
        .from('portal_condition_notes')
        .select('*')
        .in('condition_id', list.map((c) => c.id));
      const map: Record<string, ConditionNote> = {};
      (noteRows ?? []).forEach((n: any) => (map[n.condition_id] = n as ConditionNote));
      setNotes(map);
    } else {
      setNotes({});
    }
    setLoading(false);
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (type: string) => {
    if (blockPortalWrite('Adding conditions')) return;
    const meta = CONDITION_TYPES.find((c) => c.value === type)!;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('portal_transaction_conditions').insert({
      portal_id: portalId,
      transaction_id: transactionId,
      condition_type: type,
      due_date: defaultDueDate(type),
      responsible_party: meta.party,
      status: 'outstanding',
      display_order: conditions.length,
      created_by: user?.id ?? null,
    });
    if (!fail(error)) load();
  };

  const patch = async (id: string, p: Partial<PortalCondition>) => {
    if (blockPortalWrite('Editing conditions')) return;
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } as PortalCondition : c)));
    const { error } = await supabase.from('portal_transaction_conditions').update(p).eq('id', id);
    if (!fail(error)) load();
  };

  const remove = async (c: PortalCondition) => {
    if (blockPortalWrite('Removing conditions')) return;
    if (!confirm(`Remove "${conditionLabel(c)}"?`)) return;
    const { error } = await supabase.from('portal_transaction_conditions').delete().eq('id', c.id);
    if (!fail(error)) load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (blockPortalWrite('Reordering conditions')) return;
    const a = conditions[index];
    const b = conditions[index + dir];
    if (!a || !b) return;
    await supabase.from('portal_transaction_conditions').update({ display_order: index + dir }).eq('id', a.id);
    await supabase.from('portal_transaction_conditions').update({ display_order: index }).eq('id', b.id);
    load();
  };

  const settle = (c: PortalCondition, status: ConditionStatus) =>
    patch(c.id, { status, resolved_date: isSettled(status) ? today() : null });

  const saveNote = async (conditionId: string, body: string, isInternal: boolean) => {
    if (blockPortalWrite('Saving condition notes')) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('portal_condition_notes')
      .upsert(
        {
          condition_id: conditionId,
          portal_id: portalId,
          body,
          is_internal: isInternal,
          created_by: user?.id ?? null,
        },
        { onConflict: 'condition_id' },
      );
    if (!fail(error)) load();
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading conditions…</p>;

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Conditions</Label>
        <span className="text-[11px] text-muted-foreground">Click a type to log it — dates prefill</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CONDITION_TYPES.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant="outline"
            className="h-7 gap-1 rounded-full px-2.5 text-xs"
            onClick={() => add(t.value)}
          >
            <Plus className="h-3 w-3" /> {t.label}
          </Button>
        ))}
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">No conditions logged for this transaction.</p>
      )}

      {conditions.map((c, i) => {
        const overdue = isOverdue(c);
        const soon = isDueSoon(c);
        const note = notes[c.id];
        return (
          <div
            key={c.id}
            className={`rounded-lg border p-3 space-y-2 ${
              overdue ? 'border-destructive/50 bg-destructive/[0.04]' : soon ? 'border-amber-500/50 bg-amber-500/[0.04]' : 'border-border/60 bg-muted/30'
            }`}
          >
            <div className="grid gap-2 sm:grid-cols-5 items-end">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Condition</Label>
                <Select value={c.condition_type} onValueChange={(v) => patch(c.id, { condition_type: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {c.condition_type === 'other' && (
                  <Input
                    className="h-8 mt-1"
                    placeholder="Label shown to the client"
                    defaultValue={c.custom_label ?? ''}
                    onBlur={(e) =>
                      e.target.value !== (c.custom_label ?? '') &&
                      patch(c.id, { custom_label: e.target.value.trim() || null })
                    }
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due</Label>
                <Input
                  className="h-9"
                  type="date"
                  defaultValue={c.due_date ?? ''}
                  onBlur={(e) => e.target.value !== (c.due_date ?? '') && patch(c.id, { due_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={c.status} onValueChange={(v) => settle(c, v as ConditionStatus)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as ConditionStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Responsible</Label>
                <Select
                  value={c.responsible_party}
                  onValueChange={(v) => patch(c.id, { responsible_party: v as ResponsibleParty })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PARTY_LABEL) as ResponsibleParty[]).map((p) => (
                      <SelectItem key={p} value={p}>{PARTY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isSettled(c.status) ? (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[11px]">
                  {STATUS_LABEL[c.status]}{c.resolved_date ? ` ${c.resolved_date}` : ''}
                </Badge>
              ) : overdue ? (
                <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[11px] gap-1">
                  <AlertTriangle className="h-3 w-3" /> {countdownLabel(c.due_date)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px]">
                  {countdownLabel(c.due_date) ? `Due in ${countdownLabel(c.due_date)}` : 'No due date'}
                </Badge>
              )}

              {!isSettled(c.status) && (
                <>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => settle(c, 'fulfilled')}>
                    <Check className="h-3 w-3" /> Fulfilled
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => settle(c, 'waived')}>
                    <Check className="h-3 w-3" /> Waived
                  </Button>
                </>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => setOpenNote(openNote === c.id ? null : c.id)}
              >
                <StickyNote className="h-3 w-3" />
                {note?.body ? 'Note' : 'Add note'}
                {note && note.is_internal && <Lock className="h-3 w-3 text-amber-600" />}
              </Button>

              <div className="ml-auto flex items-center">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={i === conditions.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(c)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {openNote === c.id && (
              <ConditionNoteEditor
                note={note}
                onSave={(body, internal) => saveNote(c.id, body, internal)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConditionNoteEditor({
  note,
  onSave,
}: {
  note?: ConditionNote;
  onSave: (body: string, isInternal: boolean) => void;
}) {
  const [body, setBody] = useState(note?.body ?? '');
  // Notes default to internal — the client sees the condition, never the note.
  const [internal, setInternal] = useState(note?.is_internal ?? true);

  return (
    <div className="rounded-lg border border-dashed border-amber-500/40 bg-background/60 p-3 space-y-2">
      <Textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Agent note — e.g. lender waiting on pay stubs"
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={internal} onCheckedChange={setInternal} />
          {internal ? (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <Lock className="h-3 w-3" /> Internal (agent-only)
            </span>
          ) : (
            'Visible to client'
          )}
        </label>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave(body, internal)}>
          Save note
        </Button>
      </div>
    </div>
  );
}
