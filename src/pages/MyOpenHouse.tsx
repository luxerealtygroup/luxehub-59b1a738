import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DoorOpen, Plus, ChevronLeft, Loader2, Pencil, Search, Save, Trash2,
  CheckCircle2, AlertTriangle, Users, FileDown, Mail, RefreshCcw, Upload, Download, HelpCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type OpenHouse = {
  id: string;
  user_id: string;
  property_address: string;
  open_house_date: string;
  listing_agent_name: string | null;
  listing_agent_email: string | null;
  client_name: string | null;
  client_email: string | null;
  created_at: string;
  updated_at: string;
};

type InterestLevel = 'high' | 'medium' | 'low';
type PriceFeedback = 'priced_right' | 'slightly_high' | 'too_high' | 'below_market';
type ConditionFeedback = 'excellent' | 'good' | 'fair' | 'needs_work';
type Source = 'curb_hero' | 'manual';

type Attendee = {
  id: string;
  open_house_id: string;
  initials: string;
  full_name: string | null;
  fub_contact_id: string | null;
  fub_linked: boolean;
  source: Source;
  interest_level: InterestLevel | null;
  price_feedback: PriceFeedback | null;
  condition_feedback: ConditionFeedback | null;
  pre_approved: boolean;
  working_with_realtor: boolean;
  home_to_sell: boolean;
  notes: string | null;
  created_at: string;
};

const PRICE_LABEL: Record<PriceFeedback, string> = {
  priced_right: 'Priced Right',
  slightly_high: 'Slightly High',
  too_high: 'Too High',
  below_market: 'Below Market',
};
const CONDITION_LABEL: Record<ConditionFeedback, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_work: 'Needs Work',
};
const INTEREST_LABEL: Record<InterestLevel, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
};

function formatDate(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

// ============================================================================
// Main page
// ============================================================================

export default function MyOpenHouse() {
  const { user } = useAuth();
  const [houses, setHouses] = useState<OpenHouse[]>([]);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, {
    total: number; complete: number; preApproved: number; fubLinked: number;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadHouses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_houses')
      .select('*')
      .order('open_house_date', { ascending: false });
    if (error) {
      toast.error('Failed to load open houses', { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data || []) as OpenHouse[];
    setHouses(list);

    if (list.length > 0) {
      const { data: atts } = await supabase
        .from('open_house_attendees')
        .select('open_house_id, interest_level, price_feedback, condition_feedback, pre_approved, fub_linked')
        .in('open_house_id', list.map(h => h.id));
      const counts: Record<string, { total: number; complete: number; preApproved: number; fubLinked: number }> = {};
      for (const h of list) counts[h.id] = { total: 0, complete: 0, preApproved: 0, fubLinked: 0 };
      for (const a of atts || []) {
        const c = counts[a.open_house_id as string];
        if (!c) continue;
        c.total++;
        if (a.interest_level && a.price_feedback && a.condition_feedback) c.complete++;
        if (a.pre_approved) c.preApproved++;
        if (a.fub_linked) c.fubLinked++;
      }
      setAttendeeCounts(counts);
    } else {
      setAttendeeCounts({});
    }
    setLoading(false);
  };

  useEffect(() => { if (user) loadHouses(); }, [user]);

  const selected = useMemo(() => houses.find(h => h.id === selectedId) || null, [houses, selectedId]);

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
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
            <DoorOpen className="h-6 w-6 text-gold" /> Open House Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track open houses, attendees, and feedback.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New Open House</Button>
          </DialogTrigger>
          <OpenHouseFormDialog
            onClose={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); loadHouses(); }}
          />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : houses.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <DoorOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-display text-lg font-medium">No open houses yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first one to start logging attendees.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create open house
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {houses.map(h => {
            const c = attendeeCounts[h.id] || { total: 0, complete: 0, preApproved: 0, fubLinked: 0 };
            return (
              <button key={h.id} type="button" onClick={() => setSelectedId(h.id)} className="text-left">
                <Card className="p-4 hover:border-gold/60 hover:shadow-md transition-all h-full">
                  <p className="font-semibold leading-tight truncate">{h.property_address}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(h.open_house_date)}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <Stat label="Attendees" value={c.total} />
                    <Stat label="Feedback" value={`${c.complete}/${c.total}`} />
                    <Stat label="Pre-approved" value={c.preApproved} />
                    <Stat label="FUB linked" value={`${c.fubLinked}/${c.total}`} />
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/40 rounded-md px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

// ============================================================================
// Open house create/edit dialog
// ============================================================================

function OpenHouseFormDialog({
  initial, onClose, onSaved,
}: {
  initial?: OpenHouse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    property_address: initial?.property_address || '',
    open_house_date: initial?.open_house_date || new Date().toISOString().slice(0, 10),
    listing_agent_name: initial?.listing_agent_name || '',
    listing_agent_email: initial?.listing_agent_email || '',
    client_name: initial?.client_name || '',
    client_email: initial?.client_email || '',
  });

  // Team agents for the listing-agent dropdown
  type AgentOption = { id: string; full_name: string; email: string };
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [myProfile, setMyProfile] = useState<AgentOption | null>(null);
  const [listingAgentChoice, setListingAgentChoice] = useState<string>('__custom__');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email' as any)
        .not('full_name', 'is', null);
      const list: AgentOption[] = ((data as any[]) || []).map((p) => ({
        id: p.id,
        full_name: p.full_name ?? '',
        email: p.email ?? '',
      }));
      setAgents(list);
      if (user) {
        const mine = list.find((a) => a.id === user.id);
        const me: AgentOption = mine ?? {
          id: user.id,
          full_name: (user.user_metadata as any)?.full_name || user.email || 'Me',
          email: user.email || '',
        };
        // Prefer auth email when profile email is missing
        if (!me.email && user.email) me.email = user.email;
        setMyProfile(me);
      }
      // Pre-select existing on edit
      if (initial?.listing_agent_name) {
        const match = list.find(
          (a) => a.full_name.trim().toLowerCase() === (initial.listing_agent_name || '').trim().toLowerCase()
        );
        if (match) setListingAgentChoice(match.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onListingAgentSelect = (value: string) => {
    setListingAgentChoice(value);
    if (value === '__me__' && myProfile) {
      setForm((f) => ({
        ...f,
        listing_agent_name: myProfile.full_name,
        listing_agent_email: myProfile.email,
      }));
    } else if (value === '__custom__') {
      // leave fields as-is for manual editing
    } else {
      const a = agents.find((x) => x.id === value);
      if (a) {
        setForm((f) => ({
          ...f,
          listing_agent_name: a.full_name,
          listing_agent_email: a.email,
        }));
      }
    }
  };

  // FUB client typeahead
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<Array<{ id: any; name: string; email: string }>>([]);
  const [clientSearching, setClientSearching] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientLocked, setClientLocked] = useState<boolean>(!!initial?.client_name);

  useEffect(() => {
    if (clientLocked) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientResults([]);
      return;
    }
    let cancelled = false;
    setClientSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fub-search-contacts', {
          body: { query: q },
        });
        if (cancelled) return;
        if (error) {
          setClientResults([]);
        } else {
          const arr: any[] = (data as any)?.contacts || (data as any)?.people || (data as any) || [];
          const mapped = (Array.isArray(arr) ? arr : []).map((c: any) => ({
            id: c.id,
            name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)',
            email:
              c.email ||
              (Array.isArray(c.emails) && c.emails[0]?.value) ||
              '',
          }));
          setClientResults(mapped);
          setClientDropdownOpen(true);
        }
      } finally {
        if (!cancelled) setClientSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, clientLocked]);

  const selectClient = (c: { name: string; email: string }) => {
    setForm((f) => ({ ...f, client_name: c.name, client_email: c.email }));
    setClientLocked(true);
    setClientDropdownOpen(false);
    setClientQuery('');
  };

  const clearClient = () => {
    setForm((f) => ({ ...f, client_name: '', client_email: '' }));
    setClientLocked(false);
    setClientQuery('');
    setClientResults([]);
  };

  const save = async () => {
    if (!form.property_address.trim() || !form.open_house_date) {
      toast.error('Property address and date are required');
      return;
    }
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      property_address: form.property_address.trim(),
      open_house_date: form.open_house_date,
      listing_agent_name: form.listing_agent_name.trim() || null,
      listing_agent_email: form.listing_agent_email.trim() || null,
      client_name: form.client_name.trim() || null,
      client_email: form.client_email.trim() || null,
    };
    const { error } = initial
      ? await supabase.from('open_houses').update(payload).eq('id', initial.id)
      : await supabase.from('open_houses').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('Save failed', { description: error.message });
      return;
    }
    toast.success(initial ? 'Open house updated' : 'Open house created');
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? 'Edit open house' : 'New open house'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Property address *">
          <Input value={form.property_address} onChange={e => setForm({ ...form, property_address: e.target.value })} placeholder="123 Main St, City" />
        </Field>
        <Field label="Date *">
          <Input type="date" value={form.open_house_date} onChange={e => setForm({ ...form, open_house_date: e.target.value })} />
        </Field>
        <Field label="Listing agent">
          <Select value={listingAgentChoice} onValueChange={onListingAgentSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select listing agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__me__">I am the listing agent</SelectItem>
              <SelectItem value="__custom__">Enter manually…</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {listingAgentChoice === '__custom__' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input
                placeholder="Name"
                value={form.listing_agent_name}
                onChange={(e) => setForm({ ...form, listing_agent_name: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email"
                value={form.listing_agent_email}
                onChange={(e) => setForm({ ...form, listing_agent_email: e.target.value })}
              />
            </div>
          )}
          {listingAgentChoice !== '__custom__' && (form.listing_agent_name || form.listing_agent_email) && (
            <div className="text-xs text-muted-foreground mt-1">
              {form.listing_agent_name}
              {form.listing_agent_email ? ` · ${form.listing_agent_email}` : ''}
            </div>
          )}
        </Field>
        <Field label="Client">
          {clientLocked && form.client_name ? (
            <Badge variant="secondary" className="flex items-center gap-2 w-fit px-3 py-1.5">
              <span>
                {form.client_name}
                {form.client_email ? ` · ${form.client_email}` : ''}
              </span>
              <button
                type="button"
                onClick={clearClient}
                className="opacity-70 hover:opacity-100"
                aria-label="Clear client"
              >
                ×
              </button>
            </Badge>
          ) : (
            <div className="relative">
              <Input
                placeholder="Search FUB contacts or type a name…"
                value={clientQuery || form.client_name}
                onChange={(e) => {
                  const v = e.target.value;
                  setClientQuery(v);
                  setForm((f) => ({ ...f, client_name: v }));
                  setClientDropdownOpen(true);
                }}
                onFocus={() => clientResults.length > 0 && setClientDropdownOpen(true)}
              />
              {clientDropdownOpen && (clientSearching || clientResults.length > 0) && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
                  {clientSearching && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </div>
                  )}
                  {!clientSearching && clientResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                  )}
                  {clientResults.map((c, i) => (
                    <button
                      type="button"
                      key={`${c.id}-${i}`}
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                    >
                      <div className="font-medium">{c.name}</div>
                      {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                    </button>
                  ))}
                  <div className="border-t px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setClientDropdownOpen(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              <Input
                type="email"
                placeholder="Client email"
                className="mt-2"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
              />
            </div>
          )}
        </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ============================================================================
// Open house detail view
// ============================================================================

function OpenHouseDetail({
  openHouse, onBack, onChanged,
}: {
  openHouse: OpenHouse;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showFubImport, setShowFubImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const loadAttendees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_house_attendees')
      .select('*')
      .eq('open_house_id', openHouse.id)
      .order('created_at', { ascending: true });
    if (error) {
      toast.error('Failed to load attendees', { description: error.message });
    } else {
      setAttendees((data || []) as Attendee[]);
    }
    setLoading(false);
  };

  useEffect(() => { loadAttendees(); }, [openHouse.id]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          <ChevronLeft className="h-4 w-4 mr-1" /> All open houses
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold truncate">{openHouse.property_address}</h1>
            <p className="text-sm text-muted-foreground mt-1">{formatDate(openHouse.open_house_date)}</p>
          </div>
          <Dialog open={showEdit} onOpenChange={setShowEdit}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
            </DialogTrigger>
            <OpenHouseFormDialog
              initial={openHouse}
              onClose={() => setShowEdit(false)}
              onSaved={() => { setShowEdit(false); onChanged(); }}
            />
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Dialog open={showFubImport} onOpenChange={setShowFubImport}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Import from FUB
            </Button>
          </DialogTrigger>
          {showFubImport && (
            <ImportFromFubDialog
              openHouse={openHouse}
              onClose={() => setShowFubImport(false)}
              onImported={() => { setShowFubImport(false); loadAttendees(); }}
            />
          )}
        </Dialog>
        <Dialog open={showCsvImport} onOpenChange={setShowCsvImport}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-1" /> Upload Curb Hero CSV
            </Button>
          </DialogTrigger>
          {showCsvImport && (
            <UploadCurbHeroCsvDialog
              openHouse={openHouse}
              onClose={() => setShowCsvImport(false)}
              onImported={() => { setShowCsvImport(false); loadAttendees(); }}
            />
          )}
        </Dialog>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Attendee</Button>
          </DialogTrigger>
          <AddAttendeeDialog
            openHouseId={openHouse.id}
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); loadAttendees(); }}
          />
        </Dialog>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" /> Attendees <span className="text-muted-foreground font-normal">({attendees.length})</span>
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : attendees.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-sm text-muted-foreground">No attendees yet. Click "Add Attendee" to log one.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {attendees.map(a => (
              <AttendeeCard
                key={a.id}
                openHouse={openHouse}
                attendee={a}
                onChanged={loadAttendees}
              />
            ))}
          </div>
        )}
      </div>

      <ReportSection openHouse={openHouse} attendees={attendees} />
    </div>
  );
}

// ============================================================================
// Add attendee dialog (simple — feedback captured later on the card)
// ============================================================================

function AddAttendeeDialog({
  openHouseId, onClose, onSaved,
}: {
  openHouseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    initials: '',
    full_name: '',
    source: 'manual' as Source,
    fub_contact_id: null as string | null,
    fub_linked: false,
  });

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FubResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setDropdownOpen(false);
      setHasSearched(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fub-search-contacts', {
          body: { query: q },
        });
        if (cancelled) return;
        if (error) {
          setResults([]);
        } else {
          const arr: FubResult[] = (data as any)?.results || [];
          setResults(arr);
          setDropdownOpen(true);
          setHasSearched(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectContact = (contact: FubResult) => {
    setForm(f => ({
      ...f,
      full_name: contact.name,
      initials: initialsFrom(contact.name),
      fub_contact_id: contact.id,
      fub_linked: true,
    }));
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  };

  const clearContact = () => {
    setForm(f => ({
      ...f,
      full_name: '',
      initials: '',
      fub_contact_id: null,
      fub_linked: false,
    }));
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  };

  const save = async () => {
    if (!form.initials.trim()) {
      toast.error('Initials are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('open_house_attendees').insert({
      open_house_id: openHouseId,
      initials: form.initials.trim().slice(0, 3).toUpperCase(),
      full_name: form.full_name.trim() || null,
      source: form.source,
      fub_contact_id: form.fub_contact_id,
      fub_linked: form.fub_linked,
    });
    setSaving(false);
    if (error) {
      toast.error('Save failed', { description: error.message });
      return;
    }
    onSaved();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add attendee</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Initials * (max 3)">
          <Input
            value={form.initials}
            onChange={e => setForm({ ...form, initials: e.target.value.slice(0, 3) })}
            maxLength={3}
            placeholder="JD"
            className="uppercase"
          />
        </Field>
        <Field label="Full name">
          {form.fub_linked && form.full_name ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-2 w-fit px-3 py-1.5">
                <span>{form.full_name}</span>
                <button
                  type="button"
                  onClick={clearContact}
                  className="opacity-70 hover:opacity-100"
                  aria-label="Clear contact"
                >
                  ×
                </button>
              </Badge>
            </div>
          ) : (
            <div ref={containerRef} className="relative">
              <Input
                placeholder="Search FUB contacts or type a name…"
                value={query || form.full_name}
                onChange={e => {
                  const v = e.target.value;
                  setQuery(v);
                  setForm(f => ({ ...f, full_name: v, fub_contact_id: null, fub_linked: false }));
                  setDropdownOpen(true);
                }}
                onFocus={() => results.length > 0 && setDropdownOpen(true)}
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {dropdownOpen && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
                  {results.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectContact(r)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border last:border-0"
                    >
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.email && <span>{r.email}</span>}
                        {r.email && r.phone && <span> · </span>}
                        {r.phone && <span>{r.phone}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {dropdownOpen && results.length === 0 && !searching && query.trim().length >= 2 && hasSearched && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-4 text-center">
                  <p className="text-sm font-medium">No matching contact found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please add or update the contact in Follow Up Boss, then return here to select them.
                  </p>
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="Source">
          <Select value={form.source} onValueChange={v => setForm({ ...form, source: v as Source })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="curb_hero">Curb Hero</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Add
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// Attendee card — FUB link + 6 feedback fields + save
// ============================================================================

function AttendeeCard({
  openHouse, attendee, onChanged,
}: {
  openHouse: OpenHouse;
  attendee: Attendee;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<Attendee>(attendee);
  const [saving, setSaving] = useState(false);
  const [fubQuery, setFubQuery] = useState('');
  const [fubResults, setFubResults] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null }>>([]);
  const [fubSearching, setFubSearching] = useState(false);
  const [fubSearched, setFubSearched] = useState(false);

  useEffect(() => { setForm(attendee); }, [attendee.id]);

  const remove = async () => {
    if (!confirm(`Remove ${attendee.initials}?`)) return;
    const { error } = await supabase.from('open_house_attendees').delete().eq('id', attendee.id);
    if (error) { toast.error('Delete failed', { description: error.message }); return; }
    onChanged();
  };

  const searchFub = async () => {
    if (fubQuery.trim().length < 2) return;
    setFubSearching(true); setFubSearched(true);
    const { data, error } = await supabase.functions.invoke('fub-search-contacts', {
      body: { query: fubQuery.trim() },
    });
    setFubSearching(false);
    if (error) { toast.error('FUB search failed', { description: error.message }); return; }
    setFubResults((data as any)?.results || []);
  };

  const linkFub = async (contact: { id: string; name: string }) => {
    const { error } = await supabase.from('open_house_attendees').update({
      fub_contact_id: contact.id,
      fub_linked: true,
      full_name: form.full_name || contact.name,
    }).eq('id', attendee.id);
    if (error) { toast.error('Link failed', { description: error.message }); return; }
    toast.success(`Linked to ${contact.name}`);
    setFubResults([]); setFubQuery(''); setFubSearched(false);
    onChanged();
  };

  const createInFub = async () => {
    const parts = (form.full_name || fubQuery).trim().split(/\s+/);
    if (!parts[0]) { toast.error('Enter a full name or search query first'); return; }
    const { data, error } = await supabase.functions.invoke('fub-create-contact', {
      body: { firstName: parts[0], lastName: parts.slice(1).join(' ') || '' },
    });
    if (error) { toast.error('Create failed', { description: error.message }); return; }
    const created = data as { id: string; name: string };
    await linkFub(created);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('open_house_attendees').update({
      full_name: form.full_name?.trim() || null,
      interest_level: form.interest_level,
      price_feedback: form.price_feedback,
      condition_feedback: form.condition_feedback,
      pre_approved: form.pre_approved,
      working_with_realtor: form.working_with_realtor,
      home_to_sell: form.home_to_sell,
      notes: form.notes?.trim() || null,
    }).eq('id', attendee.id);
    if (error) { setSaving(false); toast.error('Save failed', { description: error.message }); return; }

    // Post FUB note if linked
    if (form.fub_linked && form.fub_contact_id) {
      const yn = (b: boolean) => b ? 'Yes' : 'No';
      const noteBody = [
        `Open House Feedback — ${openHouse.property_address} on ${formatDate(openHouse.open_house_date)}:`,
        `Interest: ${form.interest_level ? INTEREST_LABEL[form.interest_level] : '—'}`,
        `Price: ${form.price_feedback ? PRICE_LABEL[form.price_feedback] : '—'}`,
        `Condition: ${form.condition_feedback ? CONDITION_LABEL[form.condition_feedback] : '—'}`,
        `Pre-approved: ${yn(form.pre_approved)}`,
        `Working with Realtor: ${yn(form.working_with_realtor)}`,
        `Home to sell: ${yn(form.home_to_sell)}`,
        `Notes: ${form.notes?.trim() || '—'}`,
      ].join(' | ');
      const { error: noteErr } = await supabase.functions.invoke('fub-post-note', {
        body: { personId: form.fub_contact_id, noteBody },
      });
      if (noteErr) {
        toast.warning('Saved, but FUB note failed', { description: noteErr.message });
      } else {
        toast.success('Saved and posted to FUB');
      }
    } else {
      toast.success('Attendee saved');
    }
    setSaving(false);
    onChanged();
  };

  const interestColor = (lvl: InterestLevel) =>
    lvl === 'high' ? 'bg-success text-success-foreground'
    : lvl === 'medium' ? 'bg-yellow-500 text-white'
    : 'bg-destructive text-destructive-foreground';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gold/20 text-gold flex items-center justify-center font-semibold shrink-0">
          {attendee.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{form.full_name || attendee.initials}</p>
            <Badge variant="outline" className="text-[10px]">
              {attendee.source === 'curb_hero' ? 'Curb Hero' : 'Manual'}
            </Badge>
          </div>
          {form.fub_linked ? (
            <Badge className="mt-1 bg-success/20 text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Linked to FUB
            </Badge>
          ) : (
            <Badge variant="outline" className="mt-1 border-yellow-500/50 text-yellow-700 dark:text-yellow-400 gap-1">
              <AlertTriangle className="h-3 w-3" /> Not linked to FUB
            </Badge>
          )}
        </div>
        <Button size="icon" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
      </div>

      {/* FUB link section */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Link to FUB</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Search FUB contacts..."
            value={fubQuery}
            onChange={e => setFubQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchFub(); } }}
          />
          <Button size="icon" variant="outline" onClick={searchFub} disabled={fubSearching || fubQuery.trim().length < 2}>
            {fubSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {fubResults.length > 0 && (
          <div className="border border-border rounded-md max-h-44 overflow-y-auto divide-y divide-border">
            {fubResults.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => linkFub(r)}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.email || r.phone || `FUB #${r.id}`}</div>
              </button>
            ))}
          </div>
        )}
        {fubSearched && !fubSearching && fubResults.length === 0 && (
          <div className="border border-dashed border-border rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2">
            <span className="text-muted-foreground">No matches</span>
            <Button size="sm" variant="outline" onClick={createInFub}>
              <Plus className="h-3 w-3 mr-1" /> Create in Follow Up Boss
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Feedback fields */}
      <Field label="Full name">
        <Input value={form.full_name || ''} onChange={e => setForm({ ...form, full_name: e.target.value })} />
      </Field>

      <div>
        <Label className="text-xs">Interest level</Label>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(['high', 'medium', 'low'] as InterestLevel[]).map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => setForm({ ...form, interest_level: lvl })}
              className={`text-xs py-1.5 rounded border transition-colors ${
                form.interest_level === lvl
                  ? interestColor(lvl) + ' border-transparent'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {INTEREST_LABEL[lvl]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price feedback">
          <Select value={form.price_feedback || '__none__'} onValueChange={v => setForm({ ...form, price_feedback: v === '__none__' ? null : v as PriceFeedback })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(Object.keys(PRICE_LABEL) as PriceFeedback[]).map(k => (
                <SelectItem key={k} value={k}>{PRICE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Condition">
          <Select value={form.condition_feedback || '__none__'} onValueChange={v => setForm({ ...form, condition_feedback: v === '__none__' ? null : v as ConditionFeedback })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {(Object.keys(CONDITION_LABEL) as ConditionFeedback[]).map(k => (
                <SelectItem key={k} value={k}>{CONDITION_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <ToggleRow label="Pre-approved" value={form.pre_approved} onChange={v => setForm({ ...form, pre_approved: v })} />
        <ToggleRow label="Working with realtor" value={form.working_with_realtor} onChange={v => setForm({ ...form, working_with_realtor: v })} />
        <ToggleRow label="Home to sell" value={form.home_to_sell} onChange={v => setForm({ ...form, home_to_sell: v })} />
      </div>

      <Field label="Notes">
        <Textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </Field>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
        Save attendee
      </Button>
    </Card>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// ============================================================================
// Report section
// ============================================================================

function ReportSection({ openHouse, attendees }: { openHouse: OpenHouse; attendees: Attendee[] }) {
  const total = attendees.length;
  const preApproved = attendees.filter(a => a.pre_approved).length;
  const fubLinked = attendees.filter(a => a.fub_linked).length;
  const withInterest = attendees.filter(a => a.interest_level);
  const interestScore = (lvl: InterestLevel | null) => lvl === 'high' ? 3 : lvl === 'medium' ? 2 : lvl === 'low' ? 1 : 0;
  const avgInterestRaw = withInterest.length
    ? withInterest.reduce((s, a) => s + interestScore(a.interest_level), 0) / withInterest.length
    : 0;
  const avgInterestLabel = !withInterest.length ? '—'
    : avgInterestRaw >= 2.5 ? 'High' : avgInterestRaw >= 1.5 ? 'Medium' : 'Low';

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Open House Report</h2>
          <p className="text-sm text-muted-foreground">{openHouse.property_address} · {formatDate(openHouse.open_house_date)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`Email sent to ${openHouse.listing_agent_email || 'listing agent'}`)}
            disabled={!openHouse.listing_agent_email}
          >
            <Mail className="h-4 w-4 mr-1" /> Send to Listing Agent
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info('PDF download coming soon')}>
            <FileDown className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <ReportField label="Listing agent" value={openHouse.listing_agent_name || '—'} sub={openHouse.listing_agent_email || ''} />
        <ReportField label="Client" value={openHouse.client_name || '—'} sub={openHouse.client_email || ''} />
        <ReportField label="Attendees" value={String(total)} sub={`${preApproved} pre-approved`} />
        <ReportField label="Avg interest" value={avgInterestLabel} sub={`${fubLinked}/${total} in FUB`} />
      </div>

      {attendees.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Initials</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-center">Pre-Appr</TableHead>
                <TableHead className="text-center">Realtor</TableHead>
                <TableHead className="text-center">To Sell</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendees.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.initials}</TableCell>
                  <TableCell>{a.interest_level ? INTEREST_LABEL[a.interest_level] : '—'}</TableCell>
                  <TableCell>{a.price_feedback ? PRICE_LABEL[a.price_feedback] : '—'}</TableCell>
                  <TableCell>{a.condition_feedback ? CONDITION_LABEL[a.condition_feedback] : '—'}</TableCell>
                  <TableCell className="text-center">{a.pre_approved ? '✓' : '—'}</TableCell>
                  <TableCell className="text-center">{a.working_with_realtor ? '✓' : '—'}</TableCell>
                  <TableCell className="text-center">{a.home_to_sell ? '✓' : '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{a.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function ReportField({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
// ============================================================================
// Import from FUB dialog
// ============================================================================

type FubResult = { id: string; name: string; email: string | null; phone: string | null };

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

function ImportFromFubDialog({
  openHouse, onClose, onImported,
}: {
  openHouse: OpenHouse;
  onClose: () => void;
  onImported: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<FubResult[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('fub-search-contacts', {
          body: { query: openHouse.open_house_date },
        });
        if (cancelled) return;
        if (error) {
          toast.error('FUB search failed', { description: error.message });
          setResults([]);
        } else {
          setResults((data?.results || []) as FubResult[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openHouse.open_house_date]);

  const selectedIds = Object.keys(selected).filter(k => selected[k]);

  const handleImport = async () => {
    if (selectedIds.length === 0) return;
    setImporting(true);
    const rows = results
      .filter(r => selected[r.id])
      .map(r => ({
        open_house_id: openHouse.id,
        full_name: r.name,
        initials: initialsFrom(r.name),
        fub_contact_id: r.id,
        fub_linked: true,
        source: 'curb_hero' as const,
      }));
    const { error } = await supabase.from('open_house_attendees').insert(rows);
    setImporting(false);
    if (error) {
      toast.error('Import failed', { description: error.message });
      return;
    }
    toast.success(`${rows.length} attendees imported from Follow Up Boss`);
    onImported();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Import Attendees from Follow Up Boss</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching FUB…
          </div>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No FUB contacts found created on this date. Try searching manually on the attendee cards.
          </p>
        ) : (
          <div className="divide-y">
            {results.map(r => (
              <label key={r.id} className="flex items-center gap-3 py-2 cursor-pointer">
                <Checkbox
                  checked={!!selected[r.id]}
                  onCheckedChange={(v) => setSelected(s => ({ ...s, [r.id]: !!v }))}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.email || '—'}{r.phone ? ` · ${r.phone}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleImport} disabled={importing || selectedIds.length === 0}>
          {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Import Selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// Upload Curb Hero CSV dialog
// ============================================================================

type CsvContact = { firstName: string; lastName: string; email: string; phone: string };

function parseCsv(text: string): CsvContact[] {
  // Lightweight CSV parser supporting quoted values.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else field += ch;
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const findIdx = (...keys: string[]) =>
    header.findIndex(h => keys.includes(h.replace(/[_\s-]+/g, ' ').trim()));
  const iFirst = findIdx('first name', 'firstname', 'first');
  const iLast = findIdx('last name', 'lastname', 'last');
  const iEmail = findIdx('email', 'email address');
  const iPhone = findIdx('phone', 'phone number', 'mobile');

  const out: CsvContact[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => !c?.trim())) continue;
    const firstName = (iFirst >= 0 ? row[iFirst] : '')?.trim() || '';
    const lastName = (iLast >= 0 ? row[iLast] : '')?.trim() || '';
    const email = (iEmail >= 0 ? row[iEmail] : '')?.trim() || '';
    const phone = (iPhone >= 0 ? row[iPhone] : '')?.trim() || '';
    if (!firstName && !lastName && !email) continue;
    out.push({ firstName, lastName, email, phone });
  }
  return out;
}

function UploadCurbHeroCsvDialog({
  openHouse, onClose, onImported,
}: {
  openHouse: OpenHouse;
  onClose: () => void;
  onImported: () => void;
}) {
  const [contacts, setContacts] = useState<CsvContact[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string>('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) toast.error('No contacts found in CSV');
      setContacts(parsed);
    } catch (err) {
      toast.error('Failed to read CSV', { description: (err as Error).message });
    }
  };

  const handleImport = async () => {
    if (contacts.length === 0) return;
    setImporting(true);
    const rows = contacts.map(c => {
      const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
      const initials = ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?';
      return {
        open_house_id: openHouse.id,
        full_name: full || c.email || 'Unknown',
        initials,
        source: 'curb_hero' as const,
        fub_linked: false,
      };
    });
    const { data: inserted, error } = await supabase
      .from('open_house_attendees')
      .insert(rows)
      .select('id, full_name');
    if (error) {
      setImporting(false);
      toast.error('Import failed', { description: error.message });
      return;
    }

    // Auto-link via FUB search
    let linked = 0;
    await Promise.all((inserted || []).map(async (att: any) => {
      if (!att.full_name) return;
      try {
        const { data, error: searchErr } = await supabase.functions.invoke('fub-search-contacts', {
          body: { query: att.full_name },
        });
        if (searchErr) return;
        const results = (data?.results || []) as FubResult[];
        if (results.length === 1) {
          const { error: updErr } = await supabase
            .from('open_house_attendees')
            .update({ fub_contact_id: results[0].id, fub_linked: true })
            .eq('id', att.id);
          if (!updErr) linked++;
        }
      } catch {
        // ignore individual failures
      }
    }));

    setImporting(false);
    toast.success(`${rows.length} attendees imported. ${linked} linked to FUB automatically.`);
    onImported();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Upload Curb Hero CSV</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-xs">CSV file</Label>
          <Input type="file" accept=".csv,text/csv" onChange={handleFile} className="mt-1" />
          {fileName && <p className="text-xs text-muted-foreground mt-1">{fileName}</p>}
        </div>
        {contacts.length > 0 && (
          <div className="max-h-[40vh] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First</TableHead>
                  <TableHead>Last</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>{c.firstName}</TableCell>
                    <TableCell>{c.lastName}</TableCell>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell className="text-xs">{c.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleImport} disabled={importing || contacts.length === 0}>
          {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Import {contacts.length} Contact{contacts.length === 1 ? '' : 's'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
