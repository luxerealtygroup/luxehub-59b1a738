import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DoorOpen, Plus, ChevronLeft, Loader2, Pencil, Search, Save, Trash2,
  CheckCircle2, AlertTriangle, Users, FileDown, Mail, RefreshCcw, Upload, Download, HelpCircle, Share2,
  Copy, Tablet, QrCode as QrIcon,
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { tenant } from '@/config/tenant';
import { QrCode } from '@/components/openhouse/QrCode';
import { PrintQrButton } from '@/components/openhouse/PrintableQrCard';
import { agentUrl, kioskUrl, makeSlug, signInUrl } from '@/lib/openHouse/options';
import { GuestList } from '@/components/openhouse/GuestList';
import { PrepChecklist } from '@/components/openhouse/PrepChecklist';
import { SellerReportSection } from '@/components/openhouse/SellerReportSection';
import {
  CONDITION_LABEL, GUEST_COLUMNS, Guest, INTEREST_LABEL, PRICE_LABEL, guestName,
} from '@/lib/openHouse/guests';


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
  // Visitor sign-in fields (merged from the standalone Open Houses page)
  slug: string | null;
  city: string | null;
  mls_number: string | null;
  list_price: number | null;
  cover_photo_url: string | null;
  hosting_agent_id: string | null;
  listing_agent_id: string | null;

  starts_at: string | null;
  ends_at: string | null;
  disclosure_text: string | null;
  require_phone: boolean | null;
  custom_question_1: string | null;
  custom_question_2: string | null;
  custom_question_3: string | null;
  is_active: boolean | null;
  prep_kiosk_loaded: boolean | null;
  prep_signs_out: boolean | null;
  prep_qr_printed: boolean | null;
  prep_tablet_charged: boolean | null;
  prep_doors_knocked: number | null;
  seller_notes: string | null;
  competing_listings: unknown;
};

type InterestLevel = 'high' | 'medium' | 'low';
type PriceFeedback = 'priced_right' | 'slightly_high' | 'too_high' | 'below_market';
type ConditionFeedback = 'excellent' | 'good' | 'fair' | 'needs_work';

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
    total: number; signedIn: number; hot: number; awaiting: number;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
      // One list, one count — everyone lives in the guest table now.
      const { data: guests } = await supabase
        .from('open_house_visitors')
        .select('open_house_id, temperature, source, follow_up_sent_at')
        .in('open_house_id', list.map(h => h.id));
      const counts: Record<string, { total: number; signedIn: number; hot: number; awaiting: number }> = {};
      for (const h of list) counts[h.id] = { total: 0, signedIn: 0, hot: 0, awaiting: 0 };
      for (const g of guests || []) {
        const c = counts[g.open_house_id as string];
        if (!c) continue;
        c.total++;
        if (g.source === 'visitor') c.signedIn++;
        if (g.temperature === 'hot') c.hot++;
        if (!g.follow_up_sent_at) c.awaiting++;
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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowHelp(true)}>
            <HelpCircle className="h-4 w-4 mr-1" /> Help
          </Button>
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
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Help & FAQ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold">Why am I being sent to an external site?</h4>
              <p className="text-muted-foreground mt-1">
                If clicking this page sends you to <em>myopenhouse.ca</em> instead of staying inside the app,
                your phone or browser saved an old shortcut. The app no longer uses that external page.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">iPhone / iPad (Safari)</h4>
              <ol className="list-decimal list-inside text-muted-foreground mt-1 space-y-1">
                <li>Press and hold the home-screen icon until it wiggles.</li>
                <li>Tap the <strong>×</strong> to delete the shortcut.</li>
                <li>Open Safari, go to the app, tap <strong>Share → Add to Home Screen</strong>.</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold">Android (Chrome)</h4>
              <ol className="list-decimal list-inside text-muted-foreground mt-1 space-y-1">
                <li>Press and hold the home-screen icon.</li>
                <li>Drag it to <strong>Remove</strong> or <strong>Uninstall</strong>.</li>
                <li>Open Chrome, go to the app, tap <strong>⋮ → Add to Home Screen</strong>.</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold">Clear browser autocomplete</h4>
              <p className="text-muted-foreground mt-1">
                If typing the site name still suggests the old URL, clear your browser history
                for <em>myopenhouse.ca</em> or remove it from your bookmarks.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHelp(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentQrCard />


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
            const c = attendeeCounts[h.id] || { total: 0, signedIn: 0, hot: 0, awaiting: 0 };
            return (
              <button key={h.id} type="button" onClick={() => setSelectedId(h.id)} className="text-left">
                <Card className="p-4 hover:border-gold/60 hover:shadow-md transition-all h-full">
                  <p className="font-semibold leading-tight truncate">{h.property_address}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(h.open_house_date)}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <Stat label="Guests" value={c.total} />
                    <Stat label="Signed themselves in" value={c.signedIn} />
                    <Stat label="Hot" value={c.hot} />
                    <Stat label="No follow-up yet" value={c.awaiting} />
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
    city: initial?.city || '',
    mls_number: initial?.mls_number || '',
    list_price: initial?.list_price != null ? String(initial.list_price) : '',
    cover_photo_url: initial?.cover_photo_url || '',
    start_time: initial?.starts_at ? new Date(initial.starts_at).toTimeString().slice(0, 5) : '',
    end_time: initial?.ends_at ? new Date(initial.ends_at).toTimeString().slice(0, 5) : '',
    disclosure_text: initial?.disclosure_text || '',
    q1: initial?.custom_question_1 || '',
    q2: initial?.custom_question_2 || '',
    q3: initial?.custom_question_3 || '',
    require_phone: initial?.require_phone ?? true,
    is_active: initial?.is_active ?? true,
  });


  // Team members power both agent pickers
  type AgentOption = { id: string; full_name: string; email: string };
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [myProfile, setMyProfile] = useState<AgentOption | null>(null);
  const [listingAgentChoice, setListingAgentChoice] = useState<string>(
    initial?.listing_agent_id || (initial ? '__custom__' : '__none__')
  );
  const [hostingAgentId, setHostingAgentId] = useState<string>(
    initial?.hosting_agent_id || initial?.user_id || user?.id || ''
  );

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
      if (user) {
        const mine = list.find((a) => a.id === user.id);
        const me: AgentOption = mine ?? {
          id: user.id,
          full_name: (user.user_metadata as any)?.full_name || user.email || 'Me',
          email: user.email || '',
        };
        if (!me.email && user.email) me.email = user.email;
        if (!mine) list.unshift(me);
        setMyProfile(me);
        if (!initial) setHostingAgentId((h) => h || me.id);
      }
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setAgents(list);
      // Older rows only stored a typed listing agent name — match it back to a person if we can.
      if (!initial?.listing_agent_id && initial?.listing_agent_name) {
        const match = list.find(
          (a) => a.full_name.trim().toLowerCase() === (initial.listing_agent_name || '').trim().toLowerCase()
        );
        setListingAgentChoice(match ? match.id : '__custom__');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onListingAgentSelect = (value: string) => {
    setListingAgentChoice(value);
    if (value === '__none__') {
      setForm((f) => ({ ...f, listing_agent_name: '', listing_agent_email: '' }));
    } else if (value === '__custom__') {
      // leave fields as-is for manual editing
    } else {
      const a = agents.find((x) => x.id === value);
      if (a) {
        setForm((f) => ({ ...f, listing_agent_name: a.full_name, listing_agent_email: a.email }));
      }
    }
  };

  // Client picker — searches our own records: pipeline_clients and client_accounts
  // (client portal accounts, with their property address from portal_properties).
  type ClientHit = { key: string; name: string; email: string; address: string; source: 'Pipeline' | 'Portal' };
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientHit[]>([]);
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
        const like = `%${q.replace(/[%_]/g, '')}%`;
        const [pipeline, accounts] = await Promise.all([
          supabase
            .from('pipeline_clients')
            .select('id, client_name, email, property_address')
            .or(`client_name.ilike.${like},email.ilike.${like},property_address.ilike.${like}`)
            .limit(8),
          supabase
            .from('client_accounts')
            .select('id, full_name, email')
            .or(`full_name.ilike.${like},email.ilike.${like}`)
            .limit(8),
        ]);
        if (cancelled) return;

        const accountRows = (accounts.data as any[]) || [];
        let addresses: Record<string, string> = {};
        if (accountRows.length > 0) {
          const { data: props } = await supabase
            .from('portal_properties')
            .select('portal_id, address')
            .in('portal_id', accountRows.map((a) => a.id));
          for (const p of (props as any[]) || []) {
            if (p.address && !addresses[p.portal_id]) addresses[p.portal_id] = p.address;
          }
        }
        if (cancelled) return;

        const hits: ClientHit[] = [
          ...((pipeline.data as any[]) || []).map((c) => ({
            key: `pipeline-${c.id}`,
            name: c.client_name || '(no name)',
            email: c.email || '',
            address: c.property_address || '',
            source: 'Pipeline' as const,
          })),
          ...accountRows.map((c) => ({
            key: `portal-${c.id}`,
            name: c.full_name || '(no name)',
            email: c.email || '',
            address: addresses[c.id] || '',
            source: 'Portal' as const,
          })),
        ];
        // Same person in both places: keep one row.
        const seen = new Set<string>();
        setClientResults(
          hits.filter((h) => {
            const k = `${h.name.toLowerCase()}|${h.email.toLowerCase()}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
        );
        setClientDropdownOpen(true);
      } finally {
        if (!cancelled) setClientSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, clientLocked]);

  const selectClient = (c: ClientHit) => {
    setForm((f) => ({ ...f, client_name: c.name, client_email: c.email || f.client_email }));
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
    const startsAt = form.start_time ? new Date(`${form.open_house_date}T${form.start_time}`).toISOString() : null;
    const endsAt = form.end_time ? new Date(`${form.open_house_date}T${form.end_time}`).toISOString() : null;
    const payload: Record<string, unknown> = {
      user_id: user.id,
      property_address: form.property_address.trim(),
      open_house_date: form.open_house_date,
      listing_agent_name: form.listing_agent_name.trim() || null,
      listing_agent_email: form.listing_agent_email.trim() || null,
      client_name: form.client_name.trim() || null,
      client_email: form.client_email.trim() || null,
      city: form.city.trim() || null,
      mls_number: form.mls_number.trim() || null,
      list_price: form.list_price ? Number(form.list_price.replace(/[^\d.]/g, '')) : null,
      cover_photo_url: form.cover_photo_url.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      disclosure_text: form.disclosure_text.trim() || null,
      custom_question_1: form.q1.trim() || null,
      custom_question_2: form.q2.trim() || null,
      custom_question_3: form.q3.trim() || null,
      require_phone: form.require_phone,
      is_active: form.is_active,
      // The hosting agent is who actually runs the door — everything downstream keys off it.
      hosting_agent_id: hostingAgentId || user.id,
      listing_agent_id:
        listingAgentChoice && !listingAgentChoice.startsWith('__') ? listingAgentChoice : null,
    };
    if (!initial) {
      // Every open house gets its own visitor sign-in link the moment it exists.
      payload.slug = makeSlug();
      payload.created_by = user.id;
    }

    const { error } = initial
      ? await supabase.from('open_houses').update(payload as never).eq('id', initial.id)
      : await supabase.from('open_houses').insert(payload as never);

    setSaving(false);
    if (error) {
      toast.error('Save failed', { description: error.message });
      return;
    }
    toast.success(initial ? 'Open house updated' : 'Open house created');
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">

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
              <SelectItem value="__none__">Not set</SelectItem>
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
        <Field label="Hosting agent (who is running it) *">
          <Select value={hostingAgentId} onValueChange={setHostingAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select hosting agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name}
                  {myProfile && a.id === myProfile.id ? ' (me)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            The hosting agent owns this open house: their permanent QR points here, they get the live
            sign-in view, sign-ins go to them in Follow Up Boss, and visitors see their name on the thank-you screen.
          </p>
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
                placeholder="Search your clients and pipeline, or type a name…"
                value={clientQuery || form.client_name}
                onChange={(e) => {
                  const v = e.target.value;
                  setClientQuery(v);
                  setForm((f) => ({ ...f, client_name: v }));
                  setClientDropdownOpen(true);
                }}
                onFocus={() => clientResults.length > 0 && setClientDropdownOpen(true)}
              />
              {clientDropdownOpen && (clientSearching || clientResults.length > 0 || clientQuery.trim().length >= 2) && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
                  {clientSearching && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </div>
                  )}
                  {!clientSearching && clientResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No matches — keep typing to add them as free text
                    </div>
                  )}
                  {clientResults.map((c) => (
                    <button
                      type="button"
                      key={c.key}
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                    >
                      <div className="font-medium flex items-center gap-2">
                        {c.name}
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{c.source}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[c.address, c.email].filter(Boolean).join(' · ') || 'No address on file'}
                      </div>
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
              {!clientLocked && form.client_name.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Typed by hand — pick a match above to link an existing record.
                </p>
              )}
            </div>
          )}
        </Field>



        <Separator className="my-2" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Visitor sign-in page
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="MLS number">
            <Input value={form.mls_number} onChange={e => setForm({ ...form, mls_number: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="End time">
            <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </Field>
        </div>
        <Field label="List price">
          <Input value={form.list_price} onChange={e => setForm({ ...form, list_price: e.target.value })} placeholder="899000" />
        </Field>
        <Field label="Photo URL">
          <Input value={form.cover_photo_url} onChange={e => setForm({ ...form, cover_photo_url: e.target.value })} placeholder="https://..." />
        </Field>
        <Field label="Disclosure text">
          <Textarea rows={3} value={form.disclosure_text} onChange={e => setForm({ ...form, disclosure_text: e.target.value })} />
        </Field>
        <Field label="Custom questions">
          <Input value={form.q1} onChange={e => setForm({ ...form, q1: e.target.value })} placeholder="Question 1" />
          <Input className="mt-2" value={form.q2} onChange={e => setForm({ ...form, q2: e.target.value })} placeholder="Question 2" />
          <Input className="mt-2" value={form.q3} onChange={e => setForm({ ...form, q3: e.target.value })} placeholder="Question 3" />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Require a phone number</p>
            <p className="text-xs text-muted-foreground">Visitors must leave a 10-digit phone.</p>
          </div>
          <Switch checked={form.require_phone} onCheckedChange={v => setForm({ ...form, require_phone: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Sign-in page open</p>
            <p className="text-xs text-muted-foreground">Turn off once the open house is over.</p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ============================================================================
// Visitor sign-in: links, QR, kiosk (merged in from the old Operations page)
// ============================================================================

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} className="h-9 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => { navigator.clipboard.writeText(value); toast.success('Link copied'); }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** One permanent QR per agent — printed signs stay usable forever. */
function AgentQrCard() {
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [rightNow, setRightNow] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('agent_slug').eq('id', user.id).maybeSingle();
      if (!alive) return;
      const existing = (data as { agent_slug?: string | null } | null)?.agent_slug;
      if (existing) { setSlug(existing); return; }
      const fresh = makeSlug(6);
      const { error } = await supabase.from('profiles').update({ agent_slug: fresh } as never).eq('id', user.id);
      if (!error && alive) setSlug(fresh);
    })();
    return () => { alive = false; };
  }, [user]);

  // Ask the same function the QR uses, so what we print here is exactly what a visitor gets.
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const check = async () => {
      const { data } = await supabase.rpc('public_agent_open_house', { _agent_slug: slug });
      const row = (data as {
        active_slug?: string | null;
        status?: string | null;
        house_address?: string | null;
        house_starts_at?: string | null;
        house_ends_at?: string | null;
      }[] | null)?.[0];
      if (!alive) return;
      if (!row?.active_slug || !row.house_address) {
        setRightNow(null);
        return;
      }
      const time = (v?: string | null) =>
        v ? new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(':00', '') : null;
      const from = time(row.house_starts_at);
      const to = time(row.house_ends_at);
      const start = row.house_starts_at ? new Date(row.house_starts_at) : null;
      const today = start ? start.toDateString() === new Date().toDateString() : true;
      const day = today
        ? 'today'
        : start
          ? start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
          : '';
      const when = from && to ? `${day} ${from}–${to}`.trim() : day;
      const prefix = row.status === 'running' ? 'Running now: ' : 'Next up: ';
      setRightNow(`${prefix}${row.house_address}, ${when}`);
    };
    check();
    const timer = setInterval(check, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [slug]);

  if (!slug) return null;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <QrCode value={agentUrl(slug)} size={110} className="rounded-lg bg-white p-1" />
      <div className="flex-1 space-y-2">
        <p className="font-medium text-foreground">Your permanent QR</p>
        <p className="text-sm text-muted-foreground">
          Print it once. It opens the open house you're running now, otherwise your next one, otherwise
          your contact card with a short form.
        </p>
        <p className="text-sm">
          {rightNow ? (
            <>
              <span className="text-muted-foreground">Right now this opens: </span>
              <span className="font-medium text-foreground">{rightNow}</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No open house running or upcoming — this shows your contact card and lead form.
            </span>
          )}
        </p>
        <CopyField label="Permanent link" value={agentUrl(slug)} />
      </div>
      <PrintQrButton url={agentUrl(slug)} heading="Open House" subheading="Scan to sign in" />
    </Card>
  );
}


/** Sign-in link, QR and kiosk link for one open house. Older rows get a slug on demand. */
function SignInLinksCard({ openHouse, onChanged }: { openHouse: OpenHouse; onChanged: () => void }) {
  const [slug, setSlug] = useState<string | null>(openHouse.slug);
  const [creating, setCreating] = useState(false);

  useEffect(() => { setSlug(openHouse.slug); }, [openHouse.id, openHouse.slug]);

  const createLink = async () => {
    setCreating(true);
    const fresh = makeSlug();
    const { error } = await supabase
      .from('open_houses')
      .update({ slug: fresh, is_active: true } as never)
      .eq('id', openHouse.id);
    setCreating(false);
    if (error) { toast.error('Could not create the sign-in link', { description: error.message }); return; }
    setSlug(fresh);
    onChanged();
  };

  if (!slug) {
    return (
      <Card className="p-5 space-y-3">
        <p className="font-medium">Visitor sign-in</p>
        <p className="text-sm text-muted-foreground">
          This open house doesn't have a sign-in link yet.
        </p>
        <Button size="sm" onClick={createLink} disabled={creating}>
          {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create sign-in link
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="mb-4 font-medium">Visitor sign-in</p>
      <div className="grid gap-5 sm:grid-cols-[auto,1fr]">
        <QrCode value={signInUrl(slug)} size={140} className="rounded-lg bg-white p-1" />
        <div className="space-y-3">
          <CopyField label="Sign-in link" value={signInUrl(slug)} />
          <CopyField label="Kiosk link (tablet)" value={kioskUrl(slug)} />
          <div className="flex flex-wrap gap-2 pt-1">
            <PrintQrButton
              url={signInUrl(slug)}
              heading={openHouse.property_address}
              subheading={openHouse.city || undefined}
            />
            <Button size="sm" variant="outline" asChild>
              <a href={signInUrl(slug)} target="_blank" rel="noopener noreferrer">
                <QrIcon className="mr-1.5 h-4 w-4" /> Open sign-in page
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={kioskUrl(slug)} target="_blank" rel="noopener noreferrer">
                <Tablet className="mr-1.5 h-4 w-4" /> Open kiosk
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Card>
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
  const { user } = useAuth();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [hostName, setHostName] = useState<string>(openHouse.listing_agent_name || 'your agent');
  const [showEdit, setShowEdit] = useState(false);
  const [showFubImport, setShowFubImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const loadGuests = async () => {
    const { data, error } = await supabase
      .from('open_house_visitors')
      .select(GUEST_COLUMNS)
      .eq('open_house_id', openHouse.id)
      .order('signed_in_at', { ascending: true });
    if (error) {
      toast.error('Failed to load the guest list', { description: error.message });
    } else {
      setGuests((data || []) as unknown as Guest[]);
    }
  };

  useEffect(() => { loadGuests(); }, [openHouse.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = openHouse.hosting_agent_id || user?.id;
    if (!id) return;
    let alive = true;
    supabase.from('profiles').select('full_name').eq('id', id).maybeSingle().then(({ data }) => {
      if (alive && data?.full_name) setHostName(data.full_name);
    });
    return () => { alive = false; };
  }, [openHouse.hosting_agent_id, user?.id]);

  // The tracker keeps a date; the sign-in model keeps precise times.
  const endsAt = openHouse.ends_at || `${openHouse.open_house_date}T23:59:59`;

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

      <PrepChecklist
        openHouseId={openHouse.id}
        prep={{
          prep_kiosk_loaded: openHouse.prep_kiosk_loaded,
          prep_signs_out: openHouse.prep_signs_out,
          prep_qr_printed: openHouse.prep_qr_printed,
          prep_tablet_charged: openHouse.prep_tablet_charged,
          prep_doors_knocked: openHouse.prep_doors_knocked,
        }}
        onChanged={onChanged}
      />

      <SignInLinksCard openHouse={openHouse} onChanged={onChanged} />

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
              onImported={() => { setShowFubImport(false); loadGuests(); }}
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
              onImported={() => { setShowCsvImport(false); loadGuests(); }}
            />
          )}
        </Dialog>
      </div>

      <GuestList
        openHouseId={openHouse.id}
        address={openHouse.property_address}
        hostName={hostName}
        endsAt={endsAt}
      />

      <SellerReportSection
        openHouse={{
          id: openHouse.id,
          slug: openHouse.slug,
          property_address: openHouse.property_address,
          ends_at: endsAt,
          seller_notes: openHouse.seller_notes,
          competing_listings: openHouse.competing_listings,
          client_email: openHouse.client_email,
          client_name: openHouse.client_name,
        }}
        onChanged={onChanged}
      />

      <ReportSection openHouse={openHouse} guests={guests} />
    </div>
  );
}



// ============================================================================
// Report section
// ============================================================================

function ReportSection({ openHouse, guests }: { openHouse: OpenHouse; guests: Guest[] }) {
  const total = guests.length;
  const signedIn = guests.filter(g => g.source === 'visitor').length;
  const preApproved = guests.filter(g => g.lender_status === 'pre_approved').length;
  const hot = guests.filter(g => g.temperature === 'hot').length;
  const withInterest = guests.filter(g => g.interest_level);
  const interestScore = (lvl: InterestLevel | null) => lvl === 'high' ? 3 : lvl === 'medium' ? 2 : lvl === 'low' ? 1 : 0;
  const avgInterestRaw = withInterest.length
    ? withInterest.reduce((s, g) => s + interestScore(g.interest_level), 0) / withInterest.length
    : 0;
  const avgInterestLabel = !withInterest.length ? '—'
    : avgInterestRaw >= 2.5 ? 'High' : avgInterestRaw >= 1.5 ? 'Medium' : 'Low';

  const sendToListingAgent = async () => {
    if (!openHouse.listing_agent_email) return;
    const rows = [
      { label: 'Total guests', value: String(total) },
      { label: 'Signed themselves in', value: String(signedIn) },
      { label: 'Pre-approved', value: String(preApproved) },
      { label: 'Avg interest', value: avgInterestLabel },
    ];
    const notesLines = guests.map(g => {
      const parts = [
        guestName(g),
        g.temperature ? g.temperature.toUpperCase() : null,
        g.interest_level ? `Interest: ${INTEREST_LABEL[g.interest_level]}` : null,
        g.price_feedback ? `Price: ${PRICE_LABEL[g.price_feedback]}` : null,
        g.condition_feedback ? `Condition: ${CONDITION_LABEL[g.condition_feedback]}` : null,
        g.notes ? `"${g.notes}"` : null,
      ].filter(Boolean);
      return `• ${parts.join(' · ')}`;
    }).join('\n');

    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'open-house-feedback',
        recipientEmail: openHouse.listing_agent_email,
        idempotencyKey: `oh-report-${openHouse.id}-${Date.now()}`,
        templateData: {
          propertyAddress: openHouse.property_address,
          openHouseDate: formatDate(openHouse.open_house_date),
          attendeeName: `${total} guest${total === 1 ? '' : 's'}`,
          listingAgentName: openHouse.listing_agent_name || '',
          rows,
          notes: notesLines || 'No guests recorded.',
        },
      },
    });
    if (error) {
      toast.error('Email failed', { description: error.message });
    } else {
      toast.success(`Report emailed to ${openHouse.listing_agent_email}`);
    }
  };

  const pdfFileName = () => {
    const safeAddr = openHouse.property_address.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `open-house-${safeAddr}-${openHouse.open_house_date}.pdf`;
  };

  const buildPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const margin = 40;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Open House Report', margin, y);
    y += 22;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(openHouse.property_address, margin, y);
    y += 14;
    doc.setTextColor(120);
    doc.text(formatDate(openHouse.open_house_date), margin, y);
    doc.setTextColor(0);
    y += 20;

    const meta: [string, string][] = [
      ['Listing Agent', `${openHouse.listing_agent_name || '—'}${openHouse.listing_agent_email ? ` (${openHouse.listing_agent_email})` : ''}`],
      ['Client', `${openHouse.client_name || '—'}${openHouse.client_email ? ` (${openHouse.client_email})` : ''}`],
      ['Guests', `${total} (${signedIn} signed themselves in)`],
      ['Avg Interest', `${avgInterestLabel} — ${hot} hot`],
    ];
    meta.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(v, margin + 90, y);
      y += 14;
    });
    y += 6;

    if (guests.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Guest', 'How', 'Temp', 'Interest', 'Price', 'Condition', 'Timeline', 'Notes']],
        body: guests.map(g => [
          guestName(g),
          g.source === 'visitor' ? 'Signed in' : 'Agent',
          g.temperature ? g.temperature : '—',
          g.interest_level ? INTEREST_LABEL[g.interest_level] : '—',
          g.price_feedback ? PRICE_LABEL[g.price_feedback] : '—',
          g.condition_feedback ? CONDITION_LABEL[g.condition_feedback] : '—',
          g.timeline ? g.timeline.replace(/_/g, ' ') : '—',
          g.notes || '—',
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: { 7: { cellWidth: 120 } },
        margin: { left: margin, right: margin },
      });
    } else {
      doc.setTextColor(120);
      doc.text('No guests recorded.', margin, y);
    }

    return doc;
  };

  const downloadPdf = () => {
    try {
      buildPdf().save(pdfFileName());
      toast.success('PDF downloaded');
    } catch (err: any) {
      console.error('PDF generation failed', err);
      toast.error('PDF download failed', { description: err?.message });
    }
  };
  const [showSendPortal, setShowSendPortal] = useState(false);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Open House Report</h2>
          <p className="text-sm text-muted-foreground">{openHouse.property_address} · {formatDate(openHouse.open_house_date)}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={sendToListingAgent}
            disabled={!openHouse.listing_agent_email}
          >
            <Mail className="h-4 w-4 mr-1" /> Send to Listing Agent
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSendPortal(true)}>
            <Share2 className="h-4 w-4 mr-1" /> Send to Client Portal
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <FileDown className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      {showSendPortal && (
        <SendToPortalDialog
          openHouse={openHouse}
          buildPdf={buildPdf}
          fileName={pdfFileName()}
          onClose={() => setShowSendPortal(false)}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <ReportField label="Listing agent" value={openHouse.listing_agent_name || '—'} sub={openHouse.listing_agent_email || ''} />
        <ReportField label="Client" value={openHouse.client_name || '—'} sub={openHouse.client_email || ''} />
        <ReportField label="Guests" value={String(total)} sub={`${signedIn} signed themselves in`} />
        <ReportField label="Avg interest" value={avgInterestLabel} sub={`${hot} hot · ${preApproved} pre-approved`} />
      </div>

      {guests.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>How</TableHead>
                <TableHead>Temp</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{guestName(g)}</TableCell>
                  <TableCell className="text-xs">{g.source === 'visitor' ? 'Signed in' : 'Agent logged'}</TableCell>
                  <TableCell className="text-xs capitalize">{g.temperature || '—'}</TableCell>
                  <TableCell>{g.interest_level ? INTEREST_LABEL[g.interest_level] : '—'}</TableCell>
                  <TableCell>{g.price_feedback ? PRICE_LABEL[g.price_feedback] : '—'}</TableCell>
                  <TableCell>{g.condition_feedback ? CONDITION_LABEL[g.condition_feedback] : '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{g.notes || '—'}</TableCell>
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
// Send the report into a client portal
// ============================================================================

type PortalOption = { id: string; full_name: string | null; email: string | null };
type PortalPropertyOption = { id: string; address: string | null; mls_number: string | null };

function SendToPortalDialog({
  openHouse, buildPdf, fileName, onClose,
}: {
  openHouse: OpenHouse;
  buildPdf: () => jsPDF;
  fileName: string;
  onClose: () => void;
}) {
  const [portals, setPortals] = useState<PortalOption[]>([]);
  const [portalId, setPortalId] = useState<string>('');
  const [properties, setProperties] = useState<PortalPropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState<string>('general');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (error) toast.error('Failed to load client portals', { description: error.message });
      const list = (data || []) as PortalOption[];
      setPortals(list);
      const match = openHouse.client_email
        ? list.find(p => (p.email || '').toLowerCase() === openHouse.client_email!.toLowerCase())
        : undefined;
      if (match) setPortalId(match.id);
      setLoading(false);
    })();
  }, [openHouse.client_email]);

  useEffect(() => {
    if (!portalId) { setProperties([]); setPropertyId('general'); return; }
    (async () => {
      const { data } = await supabase
        .from('portal_properties')
        .select('id, address, mls_number')
        .eq('portal_id', portalId);
      const list = (data || []) as PortalPropertyOption[];
      setProperties(list);
      const addr = openHouse.property_address.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = list.find(p => (p.address || '').toLowerCase().replace(/[^a-z0-9]/g, '') === addr);
      setPropertyId(match ? match.id : 'general');
    })();
  }, [portalId, openHouse.property_address]);

  const send = async () => {
    if (!portalId) return;
    setSending(true);
    try {
      const blob = buildPdf().output('blob') as Blob;
      const path = `${portalId}/${crypto.randomUUID()}_${fileName}`;
      const up = await supabase.storage
        .from('portal-documents')
        .upload(path, blob, { contentType: 'application/pdf' });
      if (up.error) throw up.error;

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('portal_documents').insert({
        portal_id: portalId,
        file_name: fileName,
        display_name: `Open House Feedback — ${formatDate(openHouse.open_house_date)}`,
        file_path: path,
        file_type: 'application/pdf',
        file_size: blob.size,
        uploaded_by: user?.id,
        property_id: propertyId === 'general' ? null : propertyId,
        is_internal: false,
        source: 'transaction',
      });
      if (error) throw error;
      toast.success('Open house feedback sent to the client portal');
      onClose();
    } catch (err: any) {
      console.error('Send to portal failed', err);
      toast.error('Could not send to portal', { description: err?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback to a client portal</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading portals…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client portal</Label>
              <Select value={portalId} onValueChange={setPortalId}>
                <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {portals.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || 'Unnamed client'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {portalId && (
              <div className="space-y-1.5">
                <Label>Attach to property</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Portal-wide (no property)</SelectItem>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.address || p.mls_number || 'Property'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              A PDF of this open house report is saved to the client's transaction documents and is
              visible to them right away.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!portalId || sending}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
            Send to portal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      .map(r => {
        const parts = (r.name || '').trim().split(/\s+/);
        return {
          open_house_id: openHouse.id,
          first_name: parts[0] || r.name || 'Unknown',
          last_name: parts.slice(1).join(' ') || null,
          fub_contact_id: r.id,
          fub_linked: true,
          source: 'agent' as const,
        };
      });
    const { error } = await supabase.from('open_house_visitors').insert(rows);
    setImporting(false);
    if (error) {
      toast.error('Import failed', { description: error.message });
      return;
    }
    toast.success(`${rows.length} guests imported from Follow Up Boss`);

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
    const rows = contacts.map(c => ({
      open_house_id: openHouse.id,
      first_name: (c.firstName || c.email || 'Unknown').trim(),
      last_name: c.lastName?.trim() || null,
      email: c.email || null,
      phone: c.phone || null,
      source: 'agent' as const,
      fub_linked: false,
    }));
    const { data: inserted, error } = await supabase
      .from('open_house_visitors')
      .insert(rows)
      .select('id, first_name, last_name');
    if (error) {
      setImporting(false);
      toast.error('Import failed', { description: error.message });
      return;
    }

    // Auto-link via FUB search
    let linked = 0;
    await Promise.all((inserted || []).map(async (att: any) => {
      const fullName = [att.first_name, att.last_name].filter(Boolean).join(' ').trim();
      if (!fullName) return;
      try {
        const { data, error: searchErr } = await supabase.functions.invoke('fub-search-contacts', {
          body: { query: fullName },
        });
        if (searchErr) return;
        const results = (data?.results || []) as FubResult[];
        if (results.length === 1) {
          const { error: updErr } = await supabase
            .from('open_house_visitors')
            .update({ fub_contact_id: results[0].id, fub_linked: true })
            .eq('id', att.id);
          if (!updErr) linked++;
        }
      } catch {
        // ignore individual failures
      }
    }));

    setImporting(false);
    toast.success(`${rows.length} guests imported. ${linked} linked to FUB automatically.`);
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
