/**
 * Super-admin "View as team": the hub rendered as another organization sees it.
 *
 * Everything here is read-only. All figures come from the `org-preview` edge
 * function, which only SELECTs and only answers super-admins of the original
 * org. It works on luxerealtyhub.com without the tenant's subdomain resolving,
 * because the org is chosen explicitly instead of by hostname.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  AlertTriangle,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OrgPreviewBanner } from '@/components/OrgPreviewBanner';
import { useOrgPreview } from '@/hooks/useOrgPreview';

interface Summary {
  fubEnabled: boolean;
  memberCount: number;
  members: { id: string; name: string | null }[];
  portalCount: number;
  pipelineCount: number;
  manualProductionCount: number;
}

const Empty = ({ label }: { label: string }) => (
  <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>
);

/**
 * Hard-fail state. A previewed surface that cannot load its allowlisted dataset
 * says so — it must never fall back to a direct query, which would resolve to
 * the signed-in user's own organization.
 */
const Failed = ({ label, error }: { label: string; error: string }) => (
  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
    <p className="flex items-center gap-2 font-medium text-destructive">
      <AlertTriangle className="h-4 w-4" /> {label} could not be loaded
    </p>
    <p className="mt-1 text-muted-foreground">
      {error} Nothing is shown rather than risking another team's data appearing here.
    </p>
  </div>
);

const AdminTenantPreview = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { isPreviewing, branding, start, read } = useOrgPreview();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pipeline, setPipeline] = useState<Record<string, unknown>[]>([]);
  const [commissions, setCommissions] = useState<Record<string, unknown>[]>([]);
  const [manual, setManual] = useState<Record<string, unknown>[]>([]);
  const [weekly, setWeekly] = useState<Record<string, unknown>[]>([]);
  const [portals, setPortals] = useState<{ id: string; full_name: string | null }[]>([]);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const boot = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    if (!isPreviewing || branding?.orgId !== orgId) {
      const started = await start(orgId);
      if (!started) {
        setDenied(true);
        setLoading(false);
        return;
      }
    }
    const [s, p, t, w, ps] = await Promise.all([
      read<Summary>('dashboard_summary'),
      read<{ rows: Record<string, unknown>[] }>('pipeline'),
      read<{ commissions: Record<string, unknown>[]; manual: Record<string, unknown>[] }>(
        'transactions',
      ),
      read<{ rows: Record<string, unknown>[] }>('weekly_411'),
      read<{ portals: { id: string; full_name: string | null }[] }>('portal_shell'),
    ]);
    setSummary(s.ok ? s.data : null);
    setPipeline(p.ok ? (p.data.rows ?? []) : []);
    setCommissions(t.ok ? (t.data.commissions ?? []) : []);
    setManual(t.ok ? (t.data.manual ?? []) : []);
    setWeekly(w.ok ? (w.data.rows ?? []) : []);
    setPortals(ps.ok ? (ps.data.portals ?? []) : []);
    setErrors({
      dashboard: s.ok ? null : s.error,
      pipeline: p.ok ? null : p.error,
      transactions: t.ok ? null : t.error,
      weekly: w.ok ? null : w.error,
      portal: ps.ok ? null : ps.error,
    });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);


  useEffect(() => {
    void boot();
  }, [boot]);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Preview not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only a platform super-admin can preview another team's hub.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/dashboard')}>
          Back to your dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <OrgPreviewBanner />

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.name} logo`}
              className="h-10 w-auto max-w-[220px] object-contain"
            />
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{ background: branding?.primaryColor || 'hsl(var(--primary))' }}
            >
              {(branding?.name ?? '?')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold" style={{ color: branding?.textColor ?? undefined }}>
              {branding?.appName || branding?.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {branding?.slug ? `${branding.slug}.luxerealtyhub.com` : 'No web address yet'}
              {branding?.tier ? ` · ${branding.tier} plan` : ''}
              {branding?.seatLimit ? ` · ${branding.seatLimit} seat${branding.seatLimit > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {branding && !branding.fubEnabled && (
            <Badge variant="outline">Manual production mode — no Follow Up Boss</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading this team's hub…
          </div>
        ) : (
          <Tabs defaultValue="dashboard">
            <TabsList className="flex-wrap">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="weekly">Weekly accountability</TabsTrigger>
              <TabsTrigger value="portal">Client portal</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-4 space-y-4">
              {errors.dashboard && <Failed label="Dashboard" error={errors.dashboard} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Team members', value: summary?.memberCount ?? 0, icon: Users },
                { label: 'Pipeline clients', value: summary?.pipelineCount ?? 0, icon: Building2 },
                { label: 'Client portals', value: summary?.portalCount ?? 0, icon: MessageSquare },
                {
                  label: 'Manual production entries',
                  value: summary?.manualProductionCount ?? 0,
                  icon: FileText,
                },
              ].map((s) => (
                <Card key={s.label}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <s.icon className="h-3.5 w-3.5" />
                      {s.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">{s.value.toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
              </div>
            </TabsContent>

            <TabsContent value="pipeline" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pipeline</CardTitle>
                  <CardDescription>
                    {branding?.fubEnabled
                      ? 'Synced from this team’s Follow Up Boss account.'
                      : 'This team enters clients manually — no Follow Up Boss connected.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {errors.pipeline ? (
                    <Failed label="Pipeline" error={errors.pipeline} />
                  ) : pipeline.length === 0 ? (
                    <Empty label="No pipeline clients yet — this is the empty state the team will see." />
                  ) : (
                    pipeline.map((r) => (
                      <div
                        key={String(r.id)}
                        className="flex items-center justify-between rounded-md border p-3 text-sm"
                      >
                        <span>{String(r.client_name ?? 'Unnamed')}</span>
                        <span className="text-muted-foreground">{String(r.stage ?? r.status ?? '')}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commissions</CardTitle>
                </CardHeader>
                <CardContent>
                  {errors.transactions ? (
                    <Failed label="Commissions" error={errors.transactions} />
                  ) : commissions.length === 0 ? (
                    <Empty label="No commission records yet." />
                  ) : (
                    <p className="text-sm">{commissions.length.toLocaleString()} record(s)</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Manual production</CardTitle>
                </CardHeader>
                <CardContent>
                  {errors.transactions ? (
                    <Failed label="Manual production" error={errors.transactions} />
                  ) : manual.length === 0 ? (
                    <Empty label="No manual production entered yet." />
                  ) : (
                    <p className="text-sm">{manual.length.toLocaleString()} month(s) recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="weekly" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weekly accountability</CardTitle>
                  <CardDescription>4-1-1 records for this team.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {errors.weekly ? (
                    <Failed label="Weekly accountability" error={errors.weekly} />
                  ) : weekly.length === 0 ? (
                    <Empty label="No weekly records yet." />
                  ) : (
                    weekly.map((w) => (
                      <div key={String(w.id)} className="flex items-center gap-2 text-sm">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        Week of {String(w.week_start_date)}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="portal" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Client portal</CardTitle>
                  <CardDescription>
                    Portals this team's clients would sign in to, branded as {branding?.name}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {errors.portal ? (
                    <Failed label="Client portal" error={errors.portal} />
                  ) : portals.length === 0 ? (
                    <Empty label="No client portals yet — the shell is ready for their first client." />
                  ) : (
                    portals.map((p) => (
                      <div key={p.id} className="rounded-md border p-3 text-sm">
                        {p.full_name ?? 'Unnamed client'}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminTenantPreview;
