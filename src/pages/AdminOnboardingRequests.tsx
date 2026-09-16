import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Copy, Download, FileCog, Loader2, Mail, RefreshCw } from 'lucide-react';
import { HUB_ROOT_DOMAIN, normalizeWebsiteUrl, toHubUrl } from '@/lib/tenantDomain';

type RequestRow = {
  id: string;
  created_at: string;
  status: string;
  contact_name: string;
  business_name: string;
  legal_name: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  desired_domain: string | null;
  logo_path: string | null;
  team_size: string | null;
  service_area: string | null;
  slack_admin_name: string | null;
  slack_admin_email: string | null;
  uses_fub: boolean | null;
  uses_stripe: boolean | null;
  uses_asana: boolean | null;
  extra_notes: string | null;
  admin_notes: string | null;
  org_id: string | null;
  welcome_email_sent_at: string | null;
};

/** Owner invitation state for the team a request created. */
type OwnerInvite = {
  org_id: string;
  email: string;
  used_at: string | null;
  hub_host: string;
};

const STATUSES = ['new', 'in_progress', 'live', 'declined'] as const;

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  live: 'Live',
  declined: 'Declined',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  new: 'default',
  in_progress: 'secondary',
  live: 'outline',
  declined: 'destructive',
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tenant';

const yesNo = (v: boolean | null) => (v === true ? 'yes' : v === false ? 'no' : 'unknown');

function buildConfigSheet(r: RequestRow) {
  const hubUrl = toHubUrl(r.desired_domain);
  const appUrlLine = hubUrl
    ? `VITE_TENANT_APP_URL="${hubUrl}"`
    : `VITE_TENANT_APP_URL=""   # subdomain still has to be chosen (<label>.${HUB_ROOT_DOMAIN})`;
  return [
    `# Config sheet — ${r.business_name}`,
    `# Generated from setup request ${r.id}`,
    '',
    '## Frontend env (.env)',
    `VITE_TENANT_NAME="${r.business_name}"`,
    `VITE_TENANT_BROKERAGE_NAME="${r.business_name}"`,
    `VITE_TENANT_LEGAL_NAME="${r.legal_name || r.business_name}"`,
    `VITE_TENANT_SUPPORT_EMAIL="${r.email}"`,
    appUrlLine,
    `VITE_TENANT_WEBSITE_URL="${normalizeWebsiteUrl(r.website)}"`,
    `VITE_TENANT_PHONE="${r.phone || ''}"`,
    '',
    '## Backend secrets to set (values collected directly from the client — never by form)',
    `FOLLOW_UP_BOSS_API_KEY   # required: ${yesNo(r.uses_fub)}`,
    `STRIPE_API_KEY           # required: ${yesNo(r.uses_stripe)}`,
    `ASANA_ACCESS_TOKEN       # required: ${yesNo(r.uses_asana)}`,
    'SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET / SLACK_ALERT_CHANNEL',
    '',
    '## Setup notes',
    `Contact:        ${r.contact_name} <${r.email}>${r.phone ? ` / ${r.phone}` : ''}`,
    `Team size:      ${r.team_size || '—'}`,
    `Area served:    ${r.service_area || '—'}`,
    `Slack admin:    ${r.slack_admin_name || '—'} <${r.slack_admin_email || '—'}>`,
    `Requested:      ${r.desired_domain || '—'}`,
    `Hub address:    ${hubUrl || '— (subdomain still to be chosen)'}`,
    `Logo uploaded:  ${r.logo_path ? 'yes' : 'no'}`,
    `Their notes:    ${r.extra_notes || '—'}`,
    '',
  ].join('\n');
}

const AdminOnboardingRequests = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [sheetFor, setSheetFor] = useState<RequestRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Record<string, OwnerInvite>>({});
  const [welcomeFor, setWelcomeFor] = useState<RequestRow | null>(null);
  const [sendingWelcome, setSendingWelcome] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('onboarding_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Could not load requests', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const requests = (data || []) as RequestRow[];
    setRows(requests);

    const orgIds = [...new Set(requests.map((r) => r.org_id).filter(Boolean))] as string[];
    if (orgIds.length) {
      const [{ data: inviteRows }, { data: orgRows }] = await Promise.all([
        supabase
          .from('org_invites')
          .select('org_id, email, used_at, revoked_at, created_at')
          .in('org_id', orgIds)
          .eq('role', 'owner')
          .order('created_at', { ascending: false }),
        supabase.from('organizations').select('id, slug').in('id', orgIds),
      ]);
      const slugs = new Map((orgRows || []).map((o) => [o.id as string, o.slug as string]));
      const map: Record<string, OwnerInvite> = {};
      for (const inv of inviteRows || []) {
        if (inv.revoked_at) continue;
        const orgId = inv.org_id as string;
        if (map[orgId]) continue; // newest wins
        map[orgId] = {
          org_id: orgId,
          email: inv.email as string,
          used_at: (inv.used_at as string) ?? null,
          hub_host: `${slugs.get(orgId) ?? ''}.${HUB_ROOT_DOMAIN}`,
        };
      }
      setInvites(map);
    } else {
      setInvites({});
    }
    setLoading(false);
  };

  const ownerInvite = (r: RequestRow) => (r.org_id ? invites[r.org_id] : undefined);

  const sendWelcome = async (r: RequestRow) => {
    if (sendingWelcome) return;
    setSendingWelcome(true);
    const { data, error } = await supabase.functions.invoke('send-owner-welcome', {
      body: { requestId: r.id },
    });
    setSendingWelcome(false);
    if (error || (data as { error?: string })?.error) {
      toast({
        title: 'Welcome email not sent',
        description: (data as { error?: string })?.error || error?.message,
        variant: 'destructive',
      });
      return;
    }
    const sentAt = (data as { sentAt?: string })?.sentAt ?? new Date().toISOString();
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, welcome_email_sent_at: sentAt } : x)));
    setWelcomeFor(null);
    toast({ title: `Welcome email sent to ${(data as { recipient?: string })?.recipient || r.email}` });
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const updateRow = async (id: string, patch: Partial<RequestRow>) => {
    setSavingId(id);
    const { error } = await supabase.from('onboarding_requests').update(patch).eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }
    setSavingId(null);
  };

  const openLogo = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('onboarding-logos')
      .createSignedUrl(path, 300);
    if (error || !data) {
      toast({ title: 'Could not open logo', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const copySheet = async (r: RequestRow) => {
    await navigator.clipboard.writeText(buildConfigSheet(r));
    toast({ title: 'Config sheet copied' });
  };

  const downloadSheet = (r: RequestRow) => {
    const blob = new Blob([buildConfigSheet(r)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(r.business_name)}-config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-foreground">Setup Requests</h1>
          <p className="text-sm text-muted-foreground">
            Agents who asked to run their own real estate hub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No requests yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-lg">{r.business_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {r.contact_name} · {r.email}
                    {r.phone ? ` · ${r.phone}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                  <Select
                    value={r.status}
                    onValueChange={(v) => updateRow(r.id, { status: v })}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Detail label="Legal name" value={r.legal_name} />
                  <Detail label="Website" value={r.website} />
                  <div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Desired domain:</dt>
                      <dd className="text-foreground">{r.desired_domain || '—'}</dd>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {toHubUrl(r.desired_domain)
                        ? `Hub address: ${toHubUrl(r.desired_domain)}`
                        : `No subdomain chosen yet — will be <name>.${HUB_ROOT_DOMAIN}`}
                    </p>
                  </div>
                  <Detail label="Team size" value={r.team_size} />
                  <Detail label="Area served" value={r.service_area} />
                  <Detail
                    label="Slack admin"
                    value={r.slack_admin_name ? `${r.slack_admin_name} (${r.slack_admin_email || '—'})` : null}
                  />
                  <Detail label="Follow Up Boss" value={yesNo(r.uses_fub)} />
                  <Detail label="Stripe" value={yesNo(r.uses_stripe)} />
                  <Detail label="Asana" value={yesNo(r.uses_asana)} />
                </dl>

                {r.extra_notes && (
                  <p className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                    {r.extra_notes}
                  </p>
                )}

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Internal notes
                  </label>
                  <Textarea
                    defaultValue={r.admin_notes || ''}
                    rows={2}
                    onBlur={(e) => {
                      if (e.target.value !== (r.admin_notes || '')) {
                        updateRow(r.id, { admin_notes: e.target.value });
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSheetFor(r)}>
                    <FileCog className="mr-2 h-4 w-4" /> Config sheet
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copySheet(r)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadSheet(r)}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                  {r.logo_path && (
                    <Button variant="outline" size="sm" onClick={() => openLogo(r.logo_path!)}>
                      View logo
                    </Button>
                  )}
                  {ownerInvite(r) && (
                    <Button variant="outline" size="sm" onClick={() => setWelcomeFor(r)}>
                      <Mail className="mr-2 h-4 w-4" />
                      {r.welcome_email_sent_at ? 'Send welcome email again' : 'Send welcome email'}
                    </Button>
                  )}
                  {savingId === r.id && <Loader2 className="h-4 w-4 animate-spin self-center" />}
                </div>

                {ownerInvite(r) && (
                  <p className="text-xs text-muted-foreground">
                    {r.welcome_email_sent_at
                      ? `Welcome email sent ${new Date(r.welcome_email_sent_at).toLocaleString()}`
                      : 'Welcome email not sent yet'}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!sheetFor} onOpenChange={(o) => !o && setSheetFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Config sheet</DialogTitle>
            <DialogDescription>
              Everything needed to stand up {sheetFor?.business_name}'s copy. Secrets are listed by
              name only — collect the values directly from them.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[55vh] overflow-auto rounded-md bg-muted/40 p-4 text-xs leading-relaxed">
            {sheetFor ? buildConfigSheet(sheetFor) : ''}
          </pre>
          {sheetFor && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => copySheet(sheetFor)}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadSheet(sheetFor)}>
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!welcomeFor}
        onOpenChange={(o) => { if (!o && !sendingWelcome) setWelcomeFor(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send the welcome email?</DialogTitle>
            <DialogDescription>
              Nothing is sent until you confirm. The email carries their hub address and their
              own activation link — never a password.
            </DialogDescription>
          </DialogHeader>
          {welcomeFor && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Goes to</div>
                <div className="text-foreground">
                  {ownerInvite(welcomeFor)?.email || welcomeFor.email}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Hub address
                </div>
                <div className="text-foreground">
                  https://{ownerInvite(welcomeFor)?.hub_host}
                </div>
              </div>
              {welcomeFor.welcome_email_sent_at && (
                <p className="text-xs text-muted-foreground">
                  Already sent {new Date(welcomeFor.welcome_email_sent_at).toLocaleString()} —
                  sending again issues a fresh activation link.
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={sendingWelcome}
              onClick={() => setWelcomeFor(null)}
            >
              Not yet
            </Button>
            <Button
              size="sm"
              disabled={sendingWelcome}
              onClick={() => welcomeFor && sendWelcome(welcomeFor)}
            >
              {sendingWelcome && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send welcome email
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex gap-2">
    <dt className="text-muted-foreground">{label}:</dt>
    <dd className="text-foreground">{value || '—'}</dd>
  </div>
);

export default AdminOnboardingRequests;
