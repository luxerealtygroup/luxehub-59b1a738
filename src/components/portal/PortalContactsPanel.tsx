import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Globe, Lock, Mail, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';

export interface PortalContact {
  id: string;
  portal_id: string;
  name: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  is_internal: boolean;
  show_on_dashboard: boolean;
  created_by: string | null;
}

interface Props {
  portalId: string;
  /** 'agent' can manage every contact; 'client' can manage only the ones they added. */
  viewerRole: 'agent' | 'client';
}

const ROLE_SUGGESTIONS = [
  'Lawyer',
  'Mortgage broker / Lender',
  'Home inspector',
  'Insurance broker',
  'Contractor',
  'Mover',
  'Stager / Photographer',
  'Other',
];

const emptyForm = {
  name: '',
  role: '',
  company: '',
  phone: '',
  email: '',
  website: '',
  notes: '',
  is_internal: false,
  show_on_dashboard: false,
};

export function PortalContactsPanel({ portalId, viewerRole }: Props) {
  const { isPreview } = usePortalPreview();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PortalContact | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const isAgent = viewerRole === 'agent';

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: auth }] = await Promise.all([
      supabase
        .from('portal_contacts')
        .select('*')
        .eq('portal_id', portalId)
        .order('created_at', { ascending: true }),
      supabase.auth.getUser(),
    ]);
    setUserId(auth.user?.id ?? null);
    setContacts(((data as PortalContact[]) ?? []).filter((c) => (isAgent ? true : !c.is_internal)));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalId]);

  const canEdit = (c: PortalContact) => !isPreview && (isAgent || c.created_by === userId);

  const openNew = () => {
    if (blockPortalWrite('Adding contacts')) return;
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (c: PortalContact) => {
    if (blockPortalWrite('Editing contacts')) return;
    setEditing(c);
    setForm({
      name: c.name,
      role: c.role ?? '',
      company: c.company ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      website: c.website ?? '',
      notes: c.notes ?? '',
      is_internal: c.is_internal,
      show_on_dashboard: c.show_on_dashboard ?? false,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      portal_id: portalId,
      name: form.name.trim().slice(0, 120),
      role: form.role.trim().slice(0, 80) || null,
      company: form.company.trim().slice(0, 120) || null,
      phone: form.phone.trim().slice(0, 40) || null,
      email: form.email.trim().slice(0, 160) || null,
      website: form.website.trim().slice(0, 300) || null,
      notes: form.notes.trim().slice(0, 1000) || null,
      is_internal: isAgent ? form.is_internal : false,
      show_on_dashboard: form.is_internal ? false : form.show_on_dashboard,
    };

    const { error } = editing
      ? await supabase.from('portal_contacts').update(payload).eq('id', editing.id)
      : await supabase.from('portal_contacts').insert({ ...payload, created_by: userId });

    setSaving(false);
    if (error) {
      toast({ title: 'Could not save contact', description: error.message, variant: 'destructive' });
      return;
    }
    setOpen(false);
    void load();
  };

  const remove = async (c: PortalContact) => {
    if (blockPortalWrite('Deleting contacts')) return;
    if (!confirm(`Remove ${c.name}?`)) return;
    const { error } = await supabase.from('portal_contacts').delete().eq('id', c.id);
    if (error) {
      toast({ title: 'Could not remove contact', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isAgent
            ? 'Lawyers, lenders, inspectors and trades attached to this portal.'
            : 'Everyone involved in your move — your lawyer, lender, inspector and trades.'}
        </p>
        {!isPreview && (
          <Button size="sm" onClick={openNew} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" /> Add contact
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted/60 animate-pulse" />)}
        </div>
      ) : contacts.length === 0 ? (
        <div className="luxe-card p-12 flex flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight mb-1">No contacts yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Add your lawyer, mortgage broker or inspector so their details are always one tap away.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className={`group rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-luxe-hover ${
                c.is_internal ? 'border-dashed border-amber-500/50 bg-muted/50' : 'border-border/70 bg-card hover:border-primary/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.role, c.company].filter(Boolean).join(' · ') || 'Contact'}
                  </p>
                </div>
                {canEdit(c) && (
                  <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => openEdit(c)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-destructive/10" onClick={() => remove(c)} title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                    <Phone className="h-3.5 w-3.5" /> <span className="truncate">{c.phone}</span>
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.website && (
                  <a
                    href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary"
                  >
                    <Globe className="h-3.5 w-3.5" /> <span className="truncate">{c.website}</span>
                  </a>
                )}
                {c.notes && <p className="text-xs text-muted-foreground pt-1">{c.notes}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {c.show_on_dashboard && !c.is_internal && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      On dashboard
                    </span>
                  )}
                  {c.is_internal && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      <Lock className="h-3 w-3" /> Internal
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit contact' : 'Add contact'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-name">Name</Label>
              <Input id="pc-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pc-role">Role</Label>
                <Input
                  id="pc-role"
                  list="pc-role-options"
                  placeholder="Lawyer, lender, inspector…"
                  value={form.role}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
                <datalist id="pc-role-options">
                  {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pc-company">Company</Label>
                <Input id="pc-company" value={form.company} maxLength={120} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pc-phone">Phone</Label>
                <Input id="pc-phone" value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pc-email">Email</Label>
                <Input id="pc-email" type="email" value={form.email} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-website">Website</Label>
              <Input id="pc-website" value={form.website} maxLength={300} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-notes">Notes</Label>
              <Textarea id="pc-notes" rows={3} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!form.is_internal && (
                <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 w-fit">
                  <Switch
                    id="pc-dashboard"
                    checked={form.show_on_dashboard}
                    onCheckedChange={(v) => setForm({ ...form, show_on_dashboard: v })}
                  />
                  <Label htmlFor="pc-dashboard" className="text-xs cursor-pointer">
                    Show on dashboard
                  </Label>
                </div>
              )}
              {isAgent && (
                <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 w-fit">
                  <Switch
                    id="pc-internal"
                    checked={form.is_internal}
                    onCheckedChange={(v) => setForm({ ...form, is_internal: v, show_on_dashboard: v ? false : form.show_on_dashboard })}
                  />
                  <Label htmlFor="pc-internal" className="text-xs cursor-pointer flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Internal (agent-only)
                  </Label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save contact'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
