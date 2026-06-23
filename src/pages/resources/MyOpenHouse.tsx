import { useEffect, useMemo, useState } from 'react';
import { DoorOpen, Plus, Trash2, ChevronLeft, Users, Loader2, Pencil, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';

type OpenHouse = {
  id: string;
  agent_id: string;
  address: string;
  city: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  mls_number: string | null;
  notes: string | null;
};

type Attendee = {
  id: string;
  open_house_id: string;
  initials: string | null;
  full_name: string | null;
  fub_contact_id: number | null;
  fub_linked: boolean;
  source: string | null;
  interest_level: string | null;
  price_feedback: string | null;
  condition_feedback: string | null;
  pre_approved: string | null;
  working_with_realtor: string | null;
  home_to_sell: string | null;
  notes: string | null;
  created_at: string;
};

const SOURCE_OPTIONS = ['Walk-in', 'Sign', 'Online ad', 'Social media', 'Referral', 'Neighbour', 'Other'];
const INTEREST_OPTIONS = ['Hot', 'Warm', 'Cool', 'Just looking'];
const PRICE_FEEDBACK = ['Underpriced', 'Fair', 'High', 'Too high'];
const CONDITION_FEEDBACK = ['Excellent', 'Good', 'Average', 'Needs work'];
const YES_NO_UNK = ['Yes', 'No', 'Unsure'];

function formatDate(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

function formatTimeRange(s: string | null, e: string | null) {
  if (!s && !e) return '';
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, '0')} ${period}`;
  };
  if (s && e) return `${fmt(s)} – ${fmt(e)}`;
  return fmt((s || e)!);
}

export default function MyOpenHouseResources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [houses, setHouses] = useState<OpenHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = useMemo(() => houses.find(h => h.id === selectedId) || null, [houses, selectedId]);

  const loadHouses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_houses')
      .select('*')
      .order('event_date', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load open houses', description: error.message, variant: 'destructive' });
    } else {
      setHouses((data || []) as OpenHouse[]);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) loadHouses(); }, [user]);

  if (selected) {
    return (
      <OpenHouseDetail
        openHouse={selected}
        onBack={() => setSelectedId(null)}
        onChanged={loadHouses}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
            <DoorOpen className="h-6 w-6 text-gold" /> MyOpenHouse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track open houses and capture attendee feedback.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New open house</Button>
          </DialogTrigger>
          <OpenHouseFormDialog
            onClose={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); loadHouses(); }}
          />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : houses.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <DoorOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground">No open houses yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first open house to start logging attendees.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {houses.map(h => (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedId(h.id)}
              className="text-left"
            >
              <Card className="p-4 hover:border-gold/60 hover:bg-gold/5 transition-colors h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{h.address}</p>
                    {h.city && <p className="text-xs text-muted-foreground truncate">{h.city}</p>}
                  </div>
                  <Badge variant="outline" className="shrink-0">{formatDate(h.event_date)}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  {(h.start_time || h.end_time) && <span>{formatTimeRange(h.start_time, h.end_time)}</span>}
                  {h.mls_number && <span>MLS {h.mls_number}</span>}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Open house form (create/edit)
// ============================================================================

function OpenHouseFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: OpenHouse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    address: initial?.address || '',
    city: initial?.city || '',
    event_date: initial?.event_date || new Date().toISOString().slice(0, 10),
    start_time: initial?.start_time?.slice(0, 5) || '',
    end_time: initial?.end_time?.slice(0, 5) || '',
    mls_number: initial?.mls_number || '',
    notes: initial?.notes || '',
  });

  const save = async () => {
    if (!form.address.trim()) {
      toast({ title: 'Address is required', variant: 'destructive' });
      return;
    }
    if (!user) return;
    setSaving(true);
    const payload = {
      agent_id: user.id,
      address: form.address.trim(),
      city: form.city.trim() || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      mls_number: form.mls_number.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = initial
      ? await supabase.from('open_houses').update(payload).eq('id', initial.id)
      : await supabase.from('open_houses').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: initial ? 'Open house updated' : 'Open house created' });
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? 'Edit open house' : 'New open house'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Address *</Label>
          <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
        </div>
        <div>
          <Label>City</Label>
          <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Date *</Label>
            <Input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
          </div>
          <div>
            <Label>Start</Label>
            <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>MLS number</Label>
          <Input value={form.mls_number} onChange={e => setForm({ ...form, mls_number: e.target.value })} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          {initial ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// Detail view: open house + attendees
// ============================================================================

function OpenHouseDetail({
  openHouse,
  onBack,
  onChanged,
}: {
  openHouse: OpenHouse;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditHouse, setShowEditHouse] = useState(false);

  const loadAttendees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_house_attendees')
      .select('*')
      .eq('open_house_id', openHouse.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load attendees', description: error.message, variant: 'destructive' });
    } else {
      setAttendees((data || []) as Attendee[]);
    }
    setLoading(false);
  };

  useEffect(() => { loadAttendees(); }, [openHouse.id]);

  const deleteHouse = async () => {
    if (!confirm('Delete this open house and all attendee records?')) return;
    const { error } = await supabase.from('open_houses').delete().eq('id', openHouse.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Open house deleted' });
    onChanged();
    onBack();
  };

  const deleteAttendee = async (id: string) => {
    if (!confirm('Remove this attendee?')) return;
    const { error } = await supabase.from('open_house_attendees').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    loadAttendees();
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          <ChevronLeft className="h-4 w-4 mr-1" /> All open houses
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-foreground truncate">{openHouse.address}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
              {openHouse.city && <span>{openHouse.city}</span>}
              <span>·</span>
              <span>{formatDate(openHouse.event_date)}</span>
              {(openHouse.start_time || openHouse.end_time) && (
                <><span>·</span><span>{formatTimeRange(openHouse.start_time, openHouse.end_time)}</span></>
              )}
              {openHouse.mls_number && (<><span>·</span><span>MLS {openHouse.mls_number}</span></>)}
            </div>
            {openHouse.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{openHouse.notes}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Dialog open={showEditHouse} onOpenChange={setShowEditHouse}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              </DialogTrigger>
              <OpenHouseFormDialog
                initial={openHouse}
                onClose={() => setShowEditHouse(false)}
                onSaved={() => { setShowEditHouse(false); onChanged(); }}
              />
            </Dialog>
            <Button variant="outline" size="sm" onClick={deleteHouse}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" />
          Attendees <span className="text-muted-foreground font-normal">({attendees.length})</span>
        </h2>
        <Button size="sm" onClick={() => { setEditingId(null); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add attendee
        </Button>
      </div>

      {showAdd && (
        <AttendeeForm
          openHouseId={openHouse.id}
          onCancel={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadAttendees(); }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading attendees…
        </div>
      ) : attendees.length === 0 && !showAdd ? (
        <Card className="p-10 text-center border-dashed">
          <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground">No attendees yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Add your first attendee to capture feedback.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {attendees.map(a => editingId === a.id ? (
            <AttendeeForm
              key={a.id}
              openHouseId={openHouse.id}
              initial={a}
              onCancel={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); loadAttendees(); }}
            />
          ) : (
            <AttendeeCard
              key={a.id}
              attendee={a}
              onEdit={() => setEditingId(a.id)}
              onDelete={() => deleteAttendee(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Attendee card (read-only)
// ============================================================================

function AttendeeCard({
  attendee,
  onEdit,
  onDelete,
}: {
  attendee: Attendee;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const displayName = attendee.full_name?.trim() || attendee.initials?.trim() || 'Anonymous';

  const fields: Array<[string, string | null]> = [
    ['Source', attendee.source],
    ['Interest', attendee.interest_level],
    ['Price', attendee.price_feedback],
    ['Condition', attendee.condition_feedback],
    ['Pre-approved', attendee.pre_approved],
    ['Has realtor', attendee.working_with_realtor],
    ['Home to sell', attendee.home_to_sell],
  ].filter(([, v]) => v && v.length > 0) as Array<[string, string]>;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{displayName}</p>
            {attendee.fub_linked && attendee.fub_contact_id && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Link2 className="h-3 w-3" /> FUB #{attendee.fub_contact_id}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {fields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-3 text-xs">
          {fields.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <span className="text-muted-foreground">{k}: </span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
      )}
      {attendee.notes && (
        <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap border-t border-border pt-2">
          {attendee.notes}
        </p>
      )}
    </Card>
  );
}

// ============================================================================
// Attendee form (create/edit)
// ============================================================================

function AttendeeForm({
  openHouseId,
  initial,
  onCancel,
  onSaved,
}: {
  openHouseId: string;
  initial?: Attendee;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [linkedContact, setLinkedContact] = useState<{ id: number; name: string; email?: string; phone?: string } | null>(
    initial?.fub_linked && initial.fub_contact_id
      ? { id: initial.fub_contact_id, name: initial.full_name || `FUB #${initial.fub_contact_id}` }
      : null,
  );
  const [form, setForm] = useState({
    initials: initial?.initials || '',
    full_name: initial?.full_name || '',
    source: initial?.source || '',
    interest_level: initial?.interest_level || '',
    price_feedback: initial?.price_feedback || '',
    condition_feedback: initial?.condition_feedback || '',
    pre_approved: initial?.pre_approved || '',
    working_with_realtor: initial?.working_with_realtor || '',
    home_to_sell: initial?.home_to_sell || '',
    notes: initial?.notes || '',
  });

  const save = async () => {
    if (!form.initials.trim() && !form.full_name.trim() && !linkedContact) {
      toast({ title: 'Enter initials, a name, or link a FUB contact', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      open_house_id: openHouseId,
      initials: form.initials.trim() || null,
      full_name: linkedContact?.name || form.full_name.trim() || null,
      fub_contact_id: linkedContact?.id ?? null,
      fub_linked: !!linkedContact,
      source: form.source || null,
      interest_level: form.interest_level || null,
      price_feedback: form.price_feedback || null,
      condition_feedback: form.condition_feedback || null,
      pre_approved: form.pre_approved || null,
      working_with_realtor: form.working_with_realtor || null,
      home_to_sell: form.home_to_sell || null,
      notes: form.notes.trim() || null,
    };
    const { error } = initial
      ? await supabase.from('open_house_attendees').update(payload).eq('id', initial.id)
      : await supabase.from('open_house_attendees').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    onSaved();
  };

  return (
    <Card className="p-4 border-gold/40">
      <div className="space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Link to FUB contact</Label>
          <div className="mt-1">
            <FUBContactTypeahead
              selectedContact={linkedContact}
              onSelect={setLinkedContact}
              onClear={() => setLinkedContact(null)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Initials</Label>
            <Input value={form.initials} onChange={e => setForm({ ...form, initials: e.target.value })} placeholder="JD" maxLength={8} />
          </div>
          <div>
            <Label>Full name {linkedContact && <span className="text-xs text-muted-foreground">(from FUB)</span>}</Label>
            <Input
              value={linkedContact?.name || form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              disabled={!!linkedContact}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <FeedbackSelect label="Source" value={form.source} onChange={v => setForm({ ...form, source: v })} options={SOURCE_OPTIONS} />
          <FeedbackSelect label="Interest level" value={form.interest_level} onChange={v => setForm({ ...form, interest_level: v })} options={INTEREST_OPTIONS} />
          <FeedbackSelect label="Price feedback" value={form.price_feedback} onChange={v => setForm({ ...form, price_feedback: v })} options={PRICE_FEEDBACK} />
          <FeedbackSelect label="Condition feedback" value={form.condition_feedback} onChange={v => setForm({ ...form, condition_feedback: v })} options={CONDITION_FEEDBACK} />
          <FeedbackSelect label="Pre-approved" value={form.pre_approved} onChange={v => setForm({ ...form, pre_approved: v })} options={YES_NO_UNK} />
          <FeedbackSelect label="Working with realtor" value={form.working_with_realtor} onChange={v => setForm({ ...form, working_with_realtor: v })} options={YES_NO_UNK} />
          <FeedbackSelect label="Home to sell" value={form.home_to_sell} onChange={v => setForm({ ...form, home_to_sell: v })} options={YES_NO_UNK} />
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {initial ? 'Save' : 'Add attendee'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FeedbackSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}