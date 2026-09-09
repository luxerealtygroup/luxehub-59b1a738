import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Copy, DoorOpen, Loader2, Plus, QrCode as QrIcon, Tablet } from 'lucide-react';
import { QrCode } from '@/components/openhouse/QrCode';
import { PrintQrButton } from '@/components/openhouse/PrintableQrCard';
import { agentUrl, kioskUrl, makeSlug, signInUrl } from '@/lib/openHouse/options';

interface Row {
  id: string;
  slug: string | null;
  property_address: string;
  city: string | null;
  list_price: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  hosting_agent_id: string | null;
}

interface AgentOption { id: string; full_name: string | null }

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} className="h-9 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success('Link copied');
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function OpenHouses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mySlug, setMySlug] = useState<string | null>(null);

  const [f, setF] = useState({
    address: '',
    city: '',
    mls_number: '',
    list_price: '',
    cover_photo_url: '',
    date: '',
    start_time: '',
    end_time: '',
    disclosure_text: '',
    q1: '',
    q2: '',
    q3: '',
    hosting_agent_id: '',
    require_phone: true,
  });

  const load = async () => {
    setLoading(true);
    const [{ data: houses }, { data: people }] = await Promise.all([
      supabase
        .from('open_houses')
        .select('id, slug, property_address, city, list_price, starts_at, ends_at, is_active, hosting_agent_id')
        .not('slug', 'is', null)
        .order('starts_at', { ascending: false, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    setRows((houses || []) as Row[]);
    setAgents((people || []) as AgentOption[]);
    setLoading(false);
  };

  // Each agent keeps one permanent QR, so printed signs stay usable forever.
  const ensureAgentSlug = async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('agent_slug').eq('id', user.id).maybeSingle();
    if (data?.agent_slug) {
      setMySlug(data.agent_slug);
      return;
    }
    const slug = makeSlug(6);
    const { error } = await supabase.from('profiles').update({ agent_slug: slug }).eq('id', user.id);
    if (!error) setMySlug(slug);
  };

  useEffect(() => {
    if (!user) return;
    load();
    ensureAgentSlug();
    if (!f.hosting_agent_id) setF((s) => ({ ...s, hosting_agent_id: user.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const create = async () => {
    if (!user) return;
    if (!f.address.trim() || !f.date) {
      toast.error('Address and date are required');
      return;
    }
    setSaving(true);
    const startsAt = f.start_time ? new Date(`${f.date}T${f.start_time}`).toISOString() : null;
    const endsAt = f.end_time ? new Date(`${f.date}T${f.end_time}`).toISOString() : null;
    const { data, error } = await supabase
      .from('open_houses')
      .insert({
        user_id: user.id,
        created_by: user.id,
        slug: makeSlug(),
        property_address: f.address.trim(),
        city: f.city.trim() || null,
        mls_number: f.mls_number.trim() || null,
        list_price: f.list_price ? Number(f.list_price.replace(/[^\d.]/g, '')) : null,
        cover_photo_url: f.cover_photo_url.trim() || null,
        open_house_date: f.date,
        starts_at: startsAt,
        ends_at: endsAt,
        disclosure_text: f.disclosure_text.trim() || null,
        custom_question_1: f.q1.trim() || null,
        custom_question_2: f.q2.trim() || null,
        custom_question_3: f.q3.trim() || null,
        hosting_agent_id: f.hosting_agent_id || user.id,
        require_phone: f.require_phone,
        is_active: true,
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      toast.error('Could not create the open house', { description: error.message });
      return;
    }
    toast.success('Open house created');
    setShowCreate(false);
    setF((s) => ({
      ...s,
      address: '', city: '', mls_number: '', list_price: '', cover_photo_url: '',
      date: '', start_time: '', end_time: '', disclosure_text: '', q1: '', q2: '', q3: '',
    }));
    await load();
    setSelectedId(data.id);
  };

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
            <DoorOpen className="h-6 w-6 text-gold" /> Open Houses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an open house and get its sign-in link, QR code and kiosk link.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New open house
        </Button>
      </div>

      {mySlug && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <QrCode value={agentUrl(mySlug)} size={110} className="rounded-lg bg-white p-1" />
          <div className="flex-1 space-y-2">
            <p className="font-medium text-foreground">Your permanent QR</p>
            <p className="text-sm text-muted-foreground">
              Print it once. It always opens whichever of your open houses is running right now.
            </p>
            <CopyField label="Permanent link" value={agentUrl(mySlug)} />
          </div>
          <PrintQrButton url={agentUrl(mySlug)} heading="Open House" subheading="Scan to sign in" />
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No open houses yet. Create your first one to get a sign-in link.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <button
                className="flex w-full items-center justify-between gap-4 text-left"
                onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
              >
                <div>
                  <p className="font-medium text-foreground">{r.property_address}</p>
                  <p className="text-sm text-muted-foreground">
                    {[r.city, r.starts_at ? new Date(r.starts_at).toLocaleString() : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Closed'}</Badge>
              </button>

              {selectedId === r.id && r.slug && (
                <>
                  <Separator className="my-4" />
                  <div className="grid gap-5 sm:grid-cols-[auto,1fr]">
                    <QrCode value={signInUrl(r.slug)} size={140} className="rounded-lg bg-white p-1" />
                    <div className="space-y-3">
                      <CopyField label="Sign-in link" value={signInUrl(r.slug)} />
                      <CopyField label="Kiosk link (tablet)" value={kioskUrl(r.slug)} />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <PrintQrButton
                          url={signInUrl(r.slug)}
                          heading={r.property_address}
                          subheading={r.city || undefined}
                        />
                        <Button size="sm" variant="outline" asChild>
                          <a href={signInUrl(r.slug)} target="_blank" rel="noopener noreferrer">
                            <QrIcon className="mr-1.5 h-4 w-4" /> Open sign-in page
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={kioskUrl(r.slug)} target="_blank" rel="noopener noreferrer">
                            <Tablet className="mr-1.5 h-4 w-4" /> Open kiosk
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New open house</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Address *</Label>
              <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>MLS number</Label>
                <Input value={f.mls_number} onChange={(e) => setF({ ...f, mls_number: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input value={f.list_price} onChange={(e) => setF({ ...f, list_price: e.target.value })} placeholder="899000" />
              </div>
              <div className="space-y-2">
                <Label>Hosting agent</Label>
                <Select value={f.hosting_agent_id} onValueChange={(v) => setF({ ...f, hosting_agent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name || 'Unnamed'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Photo URL</Label>
              <Input value={f.cover_photo_url} onChange={(e) => setF({ ...f, cover_photo_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Disclosure text</Label>
              <Textarea rows={3} value={f.disclosure_text} onChange={(e) => setF({ ...f, disclosure_text: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Custom questions</Label>
              <Input value={f.q1} onChange={(e) => setF({ ...f, q1: e.target.value })} placeholder="Question 1" />
              <Input value={f.q2} onChange={(e) => setF({ ...f, q2: e.target.value })} placeholder="Question 2" />
              <Input value={f.q3} onChange={(e) => setF({ ...f, q3: e.target.value })} placeholder="Question 3" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Require a phone number</p>
                <p className="text-xs text-muted-foreground">Visitors must leave a 10-digit phone.</p>
              </div>
              <Switch checked={f.require_phone} onCheckedChange={(v) => setF({ ...f, require_phone: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
