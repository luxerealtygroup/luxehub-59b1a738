import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plug, Plus, Radio, Send, Settings2, Users } from 'lucide-react';
import { FubConnectionDialog } from '@/components/openhouse/FubConnectionDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { formatPhone, digits, isValidEmail } from '@/lib/openHouse/options';
import {
  DEFAULT_EMAIL_BODY, DEFAULT_EMAIL_SUBJECT, DEFAULT_SMS_TEMPLATE,
  FOLLOWUP_EMAIL_BODY_KEY, FOLLOWUP_EMAIL_SUBJECT_KEY, FOLLOWUP_SMS_KEY,
  GUEST_COLUMNS, Guest, fubState,
} from '@/lib/openHouse/guests';
import { FollowUpTemplates, GuestCard } from '@/components/openhouse/GuestCard';
import { FubStageSelect, lastStage, rememberStage } from '@/components/openhouse/FubStageSelect';

type Mode = 'live' | 'all';

export function GuestList({
  openHouseId,
  address,
  hostName,
  endsAt,
}: {
  openHouseId: string;
  address: string;
  hostName: string;
  endsAt: string | null;
}) {
  const { user } = useAuth();
  const { isAdmin, isOwner } = useUserRole();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('live');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFub, setShowFub] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [showSendAll, setShowSendAll] = useState(false);
  const [batchStage, setBatchStage] = useState<string | null>(lastStage());
  const [templates, setTemplates] = useState<FollowUpTemplates>({
    sms: DEFAULT_SMS_TEMPLATE,
    emailSubject: DEFAULT_EMAIL_SUBJECT,
    emailBody: DEFAULT_EMAIL_BODY,
  });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('open_house_visitors')
      .select(GUEST_COLUMNS)
      .eq('open_house_id', openHouseId)
      .order('signed_in_at', { ascending: false });
    if (error) {
      toast.error('Could not load the guest list', { description: error.message });
    } else {
      setGuests((data || []) as unknown as Guest[]);
    }
    setLoading(false);
  }, [openHouseId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Sign-ins arrive while the host is standing in the house.
  useEffect(() => {
    const channel = supabase
      .channel(`open-house-guests-${openHouseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'open_house_visitors', filter: `open_house_id=eq.${openHouseId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [openHouseId, load]);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [FOLLOWUP_SMS_KEY, FOLLOWUP_EMAIL_SUBJECT_KEY, FOLLOWUP_EMAIL_BODY_KEY]);
    const map = new Map((data || []).map((r) => [r.key as string, (r.value as string) || '']));
    setTemplates({
      sms: map.get(FOLLOWUP_SMS_KEY)?.trim() || DEFAULT_SMS_TEMPLATE,
      emailSubject: map.get(FOLLOWUP_EMAIL_SUBJECT_KEY)?.trim() || DEFAULT_EMAIL_SUBJECT,
      emailBody: map.get(FOLLOWUP_EMAIL_BODY_KEY)?.trim() || DEFAULT_EMAIL_BODY,
    });
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const ended = !!endsAt && new Date(endsAt).getTime() < Date.now();

  const ordered = useMemo(() => {
    const rows = [...guests];
    const stamp = (g: Guest) => new Date(g.client_captured_at || g.signed_in_at || g.created_at).getTime();
    if (mode === 'live') {
      // Newest arrival first — the person who just walked in.
      return rows.sort((a, b) => stamp(b) - stamp(a));
    }
    // After the open house, the ones nobody has followed up on come first.
    return rows.sort((a, b) => {
      const aDone = a.follow_up_sent_at ? 1 : 0;
      const bDone = b.follow_up_sent_at ? 1 : 0;
      if (ended && aDone !== bDone) return aDone - bDone;
      return stamp(b) - stamp(a);
    });
  }, [guests, mode, ended]);

  const awaitingFollowUp = guests.filter((g) => !g.follow_up_sent_at).length;
  const unsent = guests.filter((g) => !g.fub_sent_at).length;
  const fubSent = guests.filter((g) => fubState(g) === 'sent').length;
  const fubWaiting = guests.filter((g) => ['waiting', 'retrying'].includes(fubState(g))).length;
  const fubStuck = guests.filter((g) => fubState(g) === 'stuck').length;

  const sendAll = async () => {
    if (!batchStage) return;
    rememberStage(batchStage);
    setSendingAll(true);
    const { data, error } = await supabase.functions.invoke('openhouse-fub', {
      body: { action: 'push_all', openHouseId, stage: batchStage },
    });
    setSendingAll(false);
    const result = data as { sent?: number; failed?: number; error?: string } | null;
    if (error || result?.error) {
      toast.error('Could not send to Follow Up Boss', {
        description: result?.error || (error as Error)?.message,
      });
    } else if ((result?.failed ?? 0) > 0) {
      toast.warning(`${result?.sent ?? 0} sent, ${result?.failed} could not be sent`, {
        description: 'The ones that failed show the reason on their row and can be retried.',
      });
    } else {
      toast.success(`${result?.sent ?? 0} sent to Follow Up Boss`);
    }
    setShowSendAll(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5 text-gold" /> Guests{' '}
          <span className="font-normal text-muted-foreground">({guests.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(['live', 'all'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-gold/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'live' && <Radio className="h-3.5 w-3.5" />}
                {m === 'live' ? 'Live host view' : 'All guests'}
              </button>
            ))}
          </div>
          {(isAdmin || isOwner) && (
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" /> Message wording
            </Button>
          )}
          {(isAdmin || isOwner) && (
            <Button variant="outline" size="sm" onClick={() => setShowFub(true)}>
              <Plug className="mr-1.5 h-4 w-4" /> Follow Up Boss
            </Button>
          )}
          {unsent > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowSendAll(true)} disabled={sendingAll}>
              {sendingAll ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send {unsent} now
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add guest
          </Button>
        </div>
      </div>

      {guests.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Follow Up Boss: {fubSent} sent
          {fubWaiting > 0 && `, ${fubWaiting} waiting`}
          {fubStuck > 0 && (
            <span className="text-destructive">
              , {fubStuck} could not be sent — open the guest to see why
            </span>
          )}
          .{' '}
          {fubWaiting > 0 && 'Guests go over on their own; you only need "Send now" if you want them there sooner.'}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {mode === 'live'
          ? 'Sign-ins appear here the moment they happen. Fill in what you learn while they are still in the house, and set a temperature before they leave.'
          : ended
            ? `${awaitingFollowUp} of ${guests.length} still waiting on a follow-up — they are at the top.`
            : 'Everyone at this open house, however they were added.'}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : ordered.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody yet. Visitors appear here as they sign in, or add one yourself.
        </Card>
      ) : (
        <div className={mode === 'live' ? 'space-y-3' : 'grid gap-3 md:grid-cols-2'}>
          {ordered.map((g) => (
            <GuestCard
              key={g.id}
              guest={g}
              address={address}
              hostName={hostName}
              templates={templates}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddGuestDialog
          openHouseId={openHouseId}
          loggedBy={user?.id || null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {showSettings && (
        <TemplateDialog
          templates={templates}
          onClose={() => setShowSettings(false)}
          onSaved={() => { setShowSettings(false); loadTemplates(); }}
        />
      )}

      {showFub && <FubConnectionDialog onClose={() => setShowFub(false)} />}

      <Dialog open={showSendAll} onOpenChange={(o) => !o && setShowSendAll(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send {unsent} to Follow Up Boss</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Stage for this batch</Label>
            <FubStageSelect value={batchStage} onChange={setBatchStage} className="h-10 w-full" />
            <p className="text-xs text-muted-foreground">
              Anyone with their own stage picked on their row keeps that choice. Someone already in
              Follow Up Boss and being worked keeps the stage they are in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendAll(false)}>Cancel</Button>
            <Button onClick={sendAll} disabled={sendingAll || !batchStage}>
              {sendingAll && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Send {unsent}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddGuestDialog({
  openHouseId, loggedBy, onClose, onSaved,
}: {
  openHouseId: string;
  loggedBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.first_name.trim()) {
      toast.error('A first name (or initials) is needed');
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      toast.error('That email address does not look right');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('open_house_visitors').insert({
      open_house_id: openHouseId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      phone: digits(form.phone) || null,
      email: form.email.trim() || null,
      source: 'agent',
      logged_by: loggedBy,
      disclosure_accepted: false,
      custom_answers: {},
    });
    setSaving(false);
    if (error) {
      toast.error('Could not add this guest', { description: error.message });
      return;
    }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Add a guest</DialogTitle></DialogHeader>
        <div className="-mx-6 flex-1 space-y-3 overflow-y-auto px-6 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Everything else can be filled in from conversation on the guest's row.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Add guest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  templates, onClose, onSaved,
}: {
  templates: FollowUpTemplates;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sms, setSms] = useState(templates.sms);
  const [subject, setSubject] = useState(templates.emailSubject);
  const [body, setBody] = useState(templates.emailBody);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('app_settings').upsert(
      [
        { key: FOLLOWUP_SMS_KEY, value: sms.trim() || DEFAULT_SMS_TEMPLATE },
        { key: FOLLOWUP_EMAIL_SUBJECT_KEY, value: subject.trim() || DEFAULT_EMAIL_SUBJECT },
        { key: FOLLOWUP_EMAIL_BODY_KEY, value: body.trim() || DEFAULT_EMAIL_BODY },
      ],
      { onConflict: 'org_id,key' },
    );
    setSaving(false);
    if (error) {
      toast.error('Could not save the wording', { description: error.message });
      return;
    }
    toast.success('Follow-up wording saved');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Follow-up wording</DialogTitle></DialogHeader>
        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-1">
          <p className="text-sm text-muted-foreground">
            Use <code>{'{first_name}'}</code>, <code>{'{address}'}</code> and <code>{'{agent_name}'}</code> —
            they are filled in for each guest.
          </p>
          <div className="space-y-1.5">
            <Label>Text message</Label>
            <Textarea rows={3} value={sms} onChange={(e) => setSms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email message</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save wording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
