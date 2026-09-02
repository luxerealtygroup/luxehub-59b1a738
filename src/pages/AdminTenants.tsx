/**
 * Platform owner screen: provision and brand another team's account inside this
 * same app. No project copy, no code edit — a tenant is a row plus RLS scoping.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, Copy, Eye, Loader2, Palette, Plus, ShieldAlert } from 'lucide-react';
import { EditTenantBrandingDialog, type EditableOrg } from '@/components/admin/EditTenantBrandingDialog';
import { useNavigate } from 'react-router-dom';

interface Org {
  id: string;
  name: string;
  slug: string | null;
  app_name: string | null;
  brokerage_name: string | null;
  branding_primary_color: string | null;
  branding_text_color: string | null;
  branding_logo_url: string | null;
  branding_mark_url: string | null;
  seat_limit: number | null;
  tier: string | null;
  is_original_org: boolean | null;
}

const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Relative luminance contrast ratio against white. */
function contrastOnWhite(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  return Math.round(((1.05) / (l + 0.05)) * 100) / 100;
}

const emptyForm = {
  name: '',
  slug: '',
  appName: '',
  shortName: '',
  brokerageName: '',
  supportEmail: '',
  websiteDomain: '',
  primaryColor: '',
  textColor: '',
  seatLimit: '',
  ownerEmail: '',
  ownerName: '',
};

const AdminTenants = () => {
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [markFile, setMarkFile] = useState<File | null>(null);
  const [invites, setInvites] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<EditableOrg | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const markRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select(
        'id, name, slug, app_name, brokerage_name, branding_primary_color, branding_text_color, branding_logo_url, branding_mark_url, seat_limit, tier, is_original_org',
      )
      .order('created_at', { ascending: true });
    if (error) toast.error('Could not load organizations.');
    setOrgs((data as Org[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Preview is a platform-owner capability, enforced server-side by the
  // org-preview function; this only decides whether to show the button.
  useEffect(() => {
    const run = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.rpc('is_super_admin', { _user_id: auth.user.id });
      setIsSuperAdmin(data === true);
    };
    void run();
  }, []);

  const upload = async (orgId: string, file: File, kind: 'logo' | 'mark') => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${orgId}/${kind}.${ext}`;
    const { error } = await supabase.storage
      .from('org-branding')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw new Error(error.message);
    return path;
  };

  const create = async () => {
    if (!form.name.trim()) return toast.error('Enter the team name.');
    const slug = slugify(form.slug || form.name);
    if (!slug) return toast.error('Enter a web address.');

    setCreating(true);
    try {
      const { data: orgId, error } = await supabase.rpc('provision_organization', {
        _name: form.name.trim(),
        _slug: slug,
        _app_name: form.appName.trim() || null,
        _short_name: form.shortName.trim() || null,
        _brokerage_name: form.brokerageName.trim() || form.name.trim(),
        _support_email: form.supportEmail.trim() || null,
        _website_domain: form.websiteDomain.trim() || null,
        _primary_color: form.primaryColor.trim() || null,
        _text_color: form.textColor.trim() || null,
        _logo_url: null,
        _mark_url: null,
        _seat_limit: form.seatLimit ? Number(form.seatLimit) : null,
        _tier: 'pro',
      });
      if (error) throw new Error(error.message);

      const patch: Record<string, string> = {};
      if (logoFile) patch.branding_logo_url = await upload(orgId as string, logoFile, 'logo');
      if (markFile) patch.branding_mark_url = await upload(orgId as string, markFile, 'mark');
      if (Object.keys(patch).length) {
        const { error: upErr } = await supabase
          .from('organizations')
          .update(patch)
          .eq('id', orgId as string);
        if (upErr) throw new Error(upErr.message);
      }

      if (form.ownerEmail.trim()) {
        const { data: inv, error: invErr } = await supabase.rpc('create_org_owner_invite', {
          _org_id: orgId as string,
          _email: form.ownerEmail.trim(),
          _full_name: form.ownerName.trim() || null,
        });
        if (invErr) toast.error(`Organization created, but the owner invite failed: ${invErr.message}`);
        const token = Array.isArray(inv) ? inv[0]?.token : (inv as { token?: string })?.token;
        if (token) {
          setInvites((p) => ({ ...p, [orgId as string]: `${window.location.origin}/join?token=${token}` }));
        }
      }

      toast.success(`${form.name.trim()} is set up.`);
      setForm({ ...emptyForm });
      setLogoFile(null);
      setMarkFile(null);
      if (logoRef.current) logoRef.current.value = '';
      if (markRef.current) markRef.current.value = '';
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the organization.');
    } finally {
      setCreating(false);
    }
  };

  const primaryContrast = form.primaryColor ? contrastOnWhite(form.primaryColor) : null;
  const textContrast = form.textColor ? contrastOnWhite(form.textColor) : null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Organizations</h1>
        <p className="text-muted-foreground">
          Each team lives in this same app with its own data, branding and integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add a team
          </CardTitle>
          <CardDescription>
            Creates the account and, if you enter an owner email, a sign-up link for them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Team name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.slug || slugify(e.target.value),
                  }))
                }
                placeholder="Homes Into Reality"
              />
            </div>
            <div className="space-y-2">
              <Label>Web address</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="homesintoreality"
              />
              <p className="text-xs text-muted-foreground">
                {slugify(form.slug || form.name) || 'your-team'}.luxerealtyhub.com
              </p>
            </div>
            <div className="space-y-2">
              <Label>Hub name (optional)</Label>
              <Input
                value={form.appName}
                onChange={(e) => setForm((f) => ({ ...f, appName: e.target.value }))}
                placeholder="Homes Into Reality Hub"
              />
            </div>
            <div className="space-y-2">
              <Label>Short name (optional)</Label>
              <Input
                value={form.shortName}
                onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                placeholder="HIR"
              />
            </div>
            <div className="space-y-2">
              <Label>Support email</Label>
              <Input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Website domain (optional)</Label>
              <Input
                value={form.websiteDomain}
                onChange={(e) => setForm((f) => ({ ...f, websiteDomain: e.target.value }))}
                placeholder="homesintoreality.ca"
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand colour (logo and large accents)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  placeholder="#F44336"
                />
                <span
                  className="h-10 w-10 shrink-0 rounded-md border"
                  style={{ background: form.primaryColor || 'transparent' }}
                />
              </div>
              {primaryContrast !== null && (
                <p className={`text-xs ${primaryContrast < 4.5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {primaryContrast}:1 on white —{' '}
                  {primaryContrast < 4.5
                    ? 'too low for body text or small labels; large accents only.'
                    : 'passes for text.'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Text and button shade</Label>
              <div className="flex gap-2">
                <Input
                  value={form.textColor}
                  onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
                  placeholder="#E51B0D"
                />
                <span
                  className="h-10 w-10 shrink-0 rounded-md border"
                  style={{ background: form.textColor || 'transparent' }}
                />
              </div>
              {textContrast !== null && (
                <p className={`text-xs ${textContrast < 4.5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {textContrast}:1 on white — {textContrast < 4.5 ? 'below AA, pick a darker shade.' : 'passes AA.'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Wide logo (PNG with transparency)</Label>
              <Input
                ref={logoRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Shown at a fixed height so wide lockups keep their proportions. Low-resolution
                artwork is never upscaled — it renders at its natural size or smaller.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Square mark (avatars and favicon) — optional</Label>
              <Input
                ref={markRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                onChange={(e) => setMarkFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty when the logo has no clean square crop. Avatars and the favicon then
                use an initials monogram on the brand colour.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Seats</Label>
              <Input
                type="number"
                min={1}
                value={form.seatLimit}
                onChange={(e) => setForm((f) => ({ ...f, seatLimit: e.target.value }))}
                placeholder="8"
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Owner email (optional)</Label>
              <Input
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner name (optional)</Label>
              <Input
                value={form.ownerName}
                onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
              />
            </div>
          </div>

          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
            Create team
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!loading && orgs.length === 0 && (
            <p className="text-sm text-muted-foreground">No organizations yet.</p>
          )}
          {orgs.map((o) => (
            <div key={o.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.name}</span>
                {o.is_original_org && <Badge variant="secondary">Original</Badge>}
                {o.slug && <Badge variant="outline">{o.slug}.luxerealtyhub.com</Badge>}
                {o.seat_limit && <Badge variant="outline">{o.seat_limit} seats</Badge>}
                {o.branding_primary_color && (
                  <span
                    className="h-4 w-4 rounded-full border"
                    style={{ background: o.branding_primary_color }}
                  />
                )}
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => navigate(`/dashboard/admin/tenants/${o.id}/preview`)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Preview hub
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                    <Palette className="mr-1 h-3.5 w-3.5" />
                    Edit branding
                  </Button>
                )}
              </div>
              {invites[o.id] && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-muted p-2 text-xs">
                  <span className="truncate">{invites[o.id]}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(invites[o.id]);
                      toast.success('Owner link copied.');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          <p className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Each team's owner connects their own Follow Up Boss and Slack credentials on their Setup
            page — you never handle them.
          </p>
        </CardContent>
      </Card>

      <EditTenantBrandingDialog
        org={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
};

export default AdminTenants;
