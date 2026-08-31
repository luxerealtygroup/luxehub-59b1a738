import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Users,
  MessageSquare,
  FileText,
  Slack,
  Link2,
  Loader2,
  Plus,
  Settings,
  Eye,
  Send,
} from 'lucide-react';
import { AgentPortalDialog } from '@/components/AgentPortalDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { sendPortalInvite } from '@/lib/inviteLinks';
import { PortalSuggestionScanner } from '@/components/portal/PortalSuggestionScanner';


type PortalRow = {
  id: string;
  email: string;
  full_name: string | null;
  client_type: string | null;
  fub_person_id: number | null;
  slack_channel_id: string | null;
  drive_folder_id: string | null;
  user_id: string | null;
  invited_by: string | null;
  invited_at: string | null;
  claimed_at: string | null;
  created_at: string;
  agentName: string;
  status: 'active' | 'invited' | 'not_invited';

  docCount: number;
  lastMessageAt: string | null;
  lastMessageFromClient: boolean;
  transactionSides: Set<'buyer' | 'seller'>;
  propertyCount: number;
  healthScore: number;
  /** Outstanding conditions whose due date has already passed. */
  overdueConditions: number;
  /** Outstanding conditions due within the next 3 days. */
  dueSoonConditions: number;
};

type FilterKey =
  | 'all'
  | 'not_invited'
  | 'awaiting_signup'
  | 'missing_slack'
  | 'missing_docs'
  | 'missing_fub'
  | 'unread';


export default function AdminClientPortals() {
  const { isAdmin } = useUserRole();
  const [rows, setRows] = useState<PortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState<FilterKey>('all');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const { toast } = useToast();

  /** Mint a fresh single-use token and email it, straight from the row. */
  const handleResend = async (row: PortalRow) => {
    setResendingId(row.id);
    try {
      await sendPortalInvite({
        portalId: row.id,
        email: row.email,
        clientName: row.full_name,
        agentName: row.agentName,
      });
      const now = new Date().toISOString();
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, invited_at: now, status: 'invited' } : r)),
      );
      toast({
        title: 'Invitation sent',
        description: `${row.email} will receive a single-use link, valid for 7 days.`,
      });
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : 'Could not send the invitation.',
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };


  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: accounts } = await supabase
        .from('client_accounts')
        .select('id,email,full_name,client_type,fub_person_id,slack_channel_id,drive_folder_id,user_id,invited_by,invited_at,claimed_at,created_at')
        .order('created_at', { ascending: false });

      const list = (accounts ?? []) as PortalRow[];
      const inviterIds = Array.from(new Set(list.map((r) => r.invited_by).filter(Boolean))) as string[];
      const portalIds = list.map((r) => r.id);

      const [profilesRes, docsRes, msgsRes, txRes, propsRes] = await Promise.all([
        inviterIds.length
          ? supabase.from('profiles').select('id,full_name').in('id', inviterIds)
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase.from('portal_documents').select('portal_id').in('portal_id', portalIds)
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase
              .from('portal_messages')
              .select('portal_id,created_at,sender_type')
              .in('portal_id', portalIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase
              .from('portal_transactions')
              .select('portal_id,side')
              .in('portal_id', portalIds)
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase.from('portal_properties').select('portal_id').in('portal_id', portalIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p: any) => profileMap.set(p.id, p.full_name || 'Unknown'));

      const docCount = new Map<string, number>();
      (docsRes.data ?? []).forEach((d: any) => docCount.set(d.portal_id, (docCount.get(d.portal_id) ?? 0) + 1));

      const lastMsg = new Map<string, string>();
      const lastFromClient = new Map<string, boolean>();
      (msgsRes.data ?? []).forEach((m: any) => {
        if (!lastMsg.has(m.portal_id)) {
          lastMsg.set(m.portal_id, m.created_at);
          lastFromClient.set(m.portal_id, m.sender_type === 'client');
        }
      });

      // Sides are derived from the portal's transactions: Buyer, Seller, or both.
      const txSides = new Map<string, Set<'buyer' | 'seller'>>();
      (txRes.data ?? []).forEach((t: any) => {
        const set = txSides.get(t.portal_id) ?? new Set<'buyer' | 'seller'>();
        if (t.side === 'buy') set.add('buyer');
        if (t.side === 'sell') set.add('seller');
        txSides.set(t.portal_id, set);
      });

      const propCount = new Map<string, number>();
      (propsRes.data ?? []).forEach((p: any) => propCount.set(p.portal_id, (propCount.get(p.portal_id) ?? 0) + 1));

      const enriched: PortalRow[] = list.map((r) => {
        // Claimed = a real client signed up on it. Otherwise it's either
        // awaiting signup (invited) or nobody was ever asked (not_invited).
        const claimed = Boolean(r.user_id) || Boolean(r.claimed_at);
        const status: PortalRow['status'] = claimed
          ? 'active'
          : r.invited_at
            ? 'invited'
            : 'not_invited';

        const dCount = docCount.get(r.id) ?? 0;
        const lastAt = lastMsg.get(r.id) ?? null;
        const clientLast = lastFromClient.get(r.id) ?? false;
        const replied = !lastAt || !clientLast;
        const score =
          (status === 'active' ? 1 : 0) +
          (r.slack_channel_id ? 1 : 0) +
          (r.fub_person_id ? 1 : 0) +
          (dCount > 0 ? 1 : 0) +
          (replied ? 1 : 0);
        return {
          ...r,
          agentName: r.invited_by ? profileMap.get(r.invited_by) ?? 'Unknown' : 'Unknown',
          status,
          docCount: dCount,
          lastMessageAt: lastAt,
          lastMessageFromClient: clientLast,
          transactionSides: txSides.get(r.id) ?? new Set(),
          propertyCount: propCount.get(r.id) ?? 0,
          healthScore: score,
        };
      });

      setRows(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.full_name ?? ''} ${r.email} ${r.agentName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (health === 'not_invited' && r.status !== 'not_invited') return false;
      if (health === 'awaiting_signup' && r.status !== 'invited') return false;

      if (health === 'missing_slack' && r.slack_channel_id) return false;
      if (health === 'missing_docs' && r.docCount > 0) return false;
      if (health === 'missing_fub' && r.fub_person_id) return false;
      if (health === 'unread' && !(r.lastMessageAt && r.lastMessageFromClient)) return false;
      return true;
    });
  }, [rows, search, health]);

  const stats = useMemo(() => {
    return {
      all: rows.length,
      not_invited: rows.filter((r) => r.status === 'not_invited').length,
      awaiting_signup: rows.filter((r) => r.status === 'invited').length,

      missing_slack: rows.filter((r) => !r.slack_channel_id).length,
      missing_docs: rows.filter((r) => r.docCount === 0).length,
      missing_fub: rows.filter((r) => !r.fub_person_id).length,
      unread: rows.filter((r) => r.lastMessageAt && r.lastMessageFromClient).length,
    };
  }, [rows]);

  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.all },
    { key: 'not_invited', label: 'Never Invited', count: stats.not_invited },
    { key: 'awaiting_signup', label: 'Awaiting Signup', count: stats.awaiting_signup },

    { key: 'missing_slack', label: 'No Slack Channel', count: stats.missing_slack },
    { key: 'missing_docs', label: 'No Documents', count: stats.missing_docs },
    { key: 'missing_fub', label: 'No FUB Linked', count: stats.missing_fub },
    { key: 'unread', label: 'Unread Messages', count: stats.unread },
  ];

  const healthMeta = (score: number) => {
    if (score === 5) return { dot: 'bg-green-500', label: 'text-green-500', tone: '' };
    if (score >= 3) return { dot: 'bg-amber-500', label: 'text-amber-500', tone: 'bg-amber-500/[0.04]' };
    return { dot: 'bg-red-500', label: 'text-red-500', tone: 'bg-red-500/[0.05]' };
  };

  const transactionLabel = (sides: Set<'buyer' | 'seller'>, fallback: string | null) => {
    if (sides.has('buyer') && sides.has('seller')) return 'Buyer + Seller';
    if (sides.has('buyer')) return 'Buyer';
    if (sides.has('seller')) return 'Seller';
    if (fallback) return fallback.charAt(0).toUpperCase() + fallback.slice(1);
    return '—';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />
            {isAdmin ? 'Client Portals' : 'My Client Portals'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Every client portal across the team, with health at a glance.'
              : 'Your client portals, with health at a glance.'}
          </p>
        </div>
        <AgentPortalDialog
          trigger={
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Set Up New Portal
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filterChips.map((c) => {
          const active = health === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setHealth(c.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border/60 hover:border-primary/40 hover:bg-primary/[0.04]'
              }`}
            >
              {c.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* On-demand FUB stage check for linked portals — agent-confirmed, never automatic. */}
      {!loading && (
        <div className="space-y-2">
          {rows
            .filter((r) => r.fub_person_id)
            .slice(0, 12)
            .map((r) => (
              <PortalSuggestionScanner
                key={r.id}
                portalId={r.id}
                clientName={r.full_name}
                fubPersonId={r.fub_person_id}
              />
            ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">All Portals ({filtered.length})</CardTitle>
          <Input
            placeholder="Search client, email, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading portals…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              No portals match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border/50 rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-center">FUB</TableHead>
                    <TableHead className="text-center">Slack</TableHead>
                    <TableHead className="text-center">Docs</TableHead>
                    <TableHead>Last message</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const h = healthMeta(r.healthScore);
                    return (
                      <TableRow key={r.id} className={`border-border/50 ${h.tone}`}>
                      <TableCell>
                        <div className="font-medium">{r.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.agentName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className="text-xs">
                            {transactionLabel(r.transactionSides, r.client_type)}
                          </Badge>
                          {r.propertyCount === 0 ? (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              Home search
                            </Badge>
                          ) : r.propertyCount > 1 ? (
                            <span className="text-[11px] text-muted-foreground">
                              {r.propertyCount} properties
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {r.status === 'active' ? (
                            <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Active</Badge>
                          ) : r.status === 'invited' ? (
                            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">
                              Invited {r.invited_at ? format(new Date(r.invited_at), 'MMM d') : ''}
                            </Badge>
                          ) : (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30">
                              Never invited
                            </Badge>
                          )}
                          {r.status !== 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1 text-xs text-muted-foreground hover:text-primary"
                              disabled={resendingId === r.id}
                              onClick={() => handleResend(r)}
                            >
                              {resendingId === r.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-3 w-3" />
                              )}
                              {r.status === 'invited' ? 'Resend invite' : 'Send invite'}
                            </Button>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${h.dot}`} />
                          <span className={`text-xs font-semibold ${h.label}`}>{r.healthScore}/5</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link2
                          className={`h-4 w-4 mx-auto ${
                            r.fub_person_id ? 'text-green-500' : 'text-muted-foreground/40'
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Slack
                          className={`h-4 w-4 mx-auto ${
                            r.slack_channel_id ? 'text-green-500' : 'text-muted-foreground/40'
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-xs">
                          <FileText
                            className={`h-4 w-4 ${
                              r.docCount > 0 ? 'text-blue-500' : 'text-muted-foreground/40'
                            }`}
                          />
                          <span className="text-muted-foreground">{r.docCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastMessageAt ? (
                          <span
                            className={`flex items-center gap-1 ${
                              r.lastMessageFromClient ? 'text-red-500 font-medium' : ''
                            }`}
                          >
                            <MessageSquare className="h-3 w-3" />
                            {formatDistanceToNow(new Date(r.lastMessageAt), { addSuffix: true })}
                            {r.lastMessageFromClient && (
                              <span className="ml-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold">
                                Unread
                              </span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                        <Button asChild size="sm" variant="ghost" className="gap-2" title="Preview as client (read-only)">
                          <Link to={`/client-portal/preview/${r.id}`}>
                            <Eye className="h-4 w-4" />
                            Preview
                          </Link>
                        </Button>
                        <AgentPortalDialog
                          clientName={r.full_name || undefined}
                          clientEmail={r.email}
                          fubPersonId={r.fub_person_id}
                          defaultType={(r.client_type as 'buyer' | 'seller') || undefined}
                          trigger={
                            <Button size="sm" variant="outline" className="gap-2">
                              <Settings className="h-4 w-4" />
                              Manage
                            </Button>
                          }
                        />
                        </div>
                      </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}