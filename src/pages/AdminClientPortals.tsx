import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  MessageSquare,
  FileText,
  Slack,
  Link2,
  Loader2,
  Plus,
  Settings,
  Filter,
} from 'lucide-react';
import { AgentPortalDialog } from '@/components/AgentPortalDialog';
import { useUserRole } from '@/hooks/useUserRole';

type PortalRow = {
  id: string;
  email: string;
  full_name: string | null;
  client_type: string | null;
  fub_person_id: number | null;
  slack_channel_id: string | null;
  drive_folder_id: string | null;
  user_id: string;
  invited_by: string | null;
  created_at: string;
  agentName: string;
  status: 'active' | 'invited';
  docCount: number;
  lastMessageAt: string | null;
  transactionSides: Set<'buyer' | 'seller'>;
};

type FilterKey = 'all' | 'missing_slack' | 'missing_docs' | 'invited';

export default function AdminClientPortals() {
  const { isAdmin } = useUserRole();
  const [rows, setRows] = useState<PortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState<FilterKey>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: accounts } = await supabase
        .from('client_accounts')
        .select('id,email,full_name,client_type,fub_person_id,slack_channel_id,drive_folder_id,user_id,invited_by,created_at')
        .order('created_at', { ascending: false });

      const list = (accounts ?? []) as PortalRow[];
      const inviterIds = Array.from(new Set(list.map((r) => r.invited_by).filter(Boolean))) as string[];
      const portalIds = list.map((r) => r.id);

      const [profilesRes, docsRes, msgsRes, txRes] = await Promise.all([
        inviterIds.length
          ? supabase.from('profiles').select('id,full_name').in('id', inviterIds)
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase.from('portal_documents').select('portal_id').in('portal_id', portalIds)
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase
              .from('portal_messages')
              .select('portal_id,created_at')
              .in('portal_id', portalIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        portalIds.length
          ? supabase
              .from('client_transactions')
              .select('client_account_id,transaction_type')
              .in('client_account_id', portalIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p: any) => profileMap.set(p.id, p.full_name || 'Unknown'));

      const docCount = new Map<string, number>();
      (docsRes.data ?? []).forEach((d: any) => docCount.set(d.portal_id, (docCount.get(d.portal_id) ?? 0) + 1));

      const lastMsg = new Map<string, string>();
      (msgsRes.data ?? []).forEach((m: any) => {
        if (!lastMsg.has(m.portal_id)) lastMsg.set(m.portal_id, m.created_at);
      });

      const txSides = new Map<string, Set<'buyer' | 'seller'>>();
      (txRes.data ?? []).forEach((t: any) => {
        const set = txSides.get(t.client_account_id) ?? new Set();
        if (t.transaction_type === 'buyer' || t.transaction_type === 'seller') set.add(t.transaction_type);
        txSides.set(t.client_account_id, set);
      });

      const enriched: PortalRow[] = list.map((r) => ({
        ...r,
        agentName: r.invited_by ? profileMap.get(r.invited_by) ?? 'Unknown' : 'Unknown',
        status: r.user_id === r.invited_by ? 'invited' : 'active',
        docCount: docCount.get(r.id) ?? 0,
        lastMessageAt: lastMsg.get(r.id) ?? null,
        transactionSides: txSides.get(r.id) ?? new Set(),
      }));

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
      if (health === 'missing_slack' && r.slack_channel_id) return false;
      if (health === 'missing_docs' && r.docCount > 0) return false;
      if (health === 'invited' && r.status !== 'invited') return false;
      return true;
    });
  }, [rows, search, health]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === 'active').length;
    const invited = rows.filter((r) => r.status === 'invited').length;
    const missingSlack = rows.filter((r) => !r.slack_channel_id).length;
    const missingDocs = rows.filter((r) => r.docCount === 0).length;
    return { active, invited, missingSlack, missingDocs };
  }, [rows]);

  const transactionLabel = (sides: Set<'buyer' | 'seller'>, fallback: string | null) => {
    if (sides.has('buyer') && sides.has('seller')) return 'Both';
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: stats.active, color: 'text-green-500' },
          { label: 'Invited (pending)', value: stats.invited, color: 'text-amber-500' },
          { label: 'Missing Slack', value: stats.missingSlack, color: 'text-orange-500' },
          { label: 'No documents', value: stats.missingDocs, color: 'text-blue-500' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">All Portals ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search client, email, agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Select value={health} onValueChange={(v) => setHealth(v as FilterKey)}>
              <SelectTrigger className="w-48 gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All portals</SelectItem>
                <SelectItem value="invited">Not yet signed up</SelectItem>
                <SelectItem value="missing_slack">Missing Slack channel</SelectItem>
                <SelectItem value="missing_docs">No documents uploaded</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                    <TableHead className="text-center">FUB</TableHead>
                    <TableHead className="text-center">Slack</TableHead>
                    <TableHead className="text-center">Docs</TableHead>
                    <TableHead>Last message</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="border-border/50">
                      <TableCell>
                        <div className="font-medium">{r.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.agentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {transactionLabel(r.transactionSides, r.client_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'active' ? (
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Active</Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Invited</Badge>
                        )}
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
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {formatDistanceToNow(new Date(r.lastMessageAt), { addSuffix: true })}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}