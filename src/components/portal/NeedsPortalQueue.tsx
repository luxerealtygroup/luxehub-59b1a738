import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link2, Loader2, Plus, UserPlus } from 'lucide-react';
import { AgentPortalDialog } from '@/components/AgentPortalDialog';
import { AttachToPortalDialog } from '@/components/portal/AttachToPortalDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';

/**
 * Signed clients: buyers from "BRA Signed" onward, sellers once their listing
 * is signed (Exclusive Listing / Active on MLS) and onward.
 */
const SIGNED_FROM_STAGE = 4;
const SELLER_SIGNED_STAGES = [2, 3];

type QueueRow = {
  id: string;
  client_name: string;
  email: string | null;
  client_type: string | null;
  property_address: string | null;
  updated_at: string;
  user_id: string;
  agentName: string;
};

interface NeedsPortalQueueProps {
  /** Called after a portal is created or attached so the parent list refreshes. */
  onPortalCreated: () => void;
  /** Shared page search text — matches client, email or agent. */
  search?: string;
  /** Shared Buyer / Seller filter. */
  typeFilter?: 'all' | 'buyer' | 'seller';
  /** Shared agent filter, by agent name. */
  agentFilter?: string;
}

export function NeedsPortalQueue({
  onPortalCreated,
  search = '',
  typeFilter = 'all',
  agentFilter = 'all',
}: NeedsPortalQueueProps) {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('pipeline_clients')
        .select('id,client_name,email,client_type,property_address,updated_at,user_id,stage')
        // A client record belongs to at most one portal. No portal attached is
        // the only definition of "needs a portal" — never an email match.
        .is('portal_id', null)
        .or(
          `stage.gte.${SIGNED_FROM_STAGE},and(client_type.eq.seller,stage.in.(${SELLER_SIGNED_STAGES.join(',')}))`,
        );
      // Admins and owners see the whole team; everyone else only their own.
      if (!isAdmin && user) query = query.eq('user_id', user.id);

      const { data } = await query;
      const list = (data ?? []) as (QueueRow & { stage: number })[];

      const agentIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean)));
      const { data: profiles } = agentIds.length
        ? await supabase.from('profiles').select('id,full_name').in('id', agentIds)
        : { data: [] as any[] };
      const names = new Map<string, string>();
      (profiles ?? []).forEach((p: any) => names.set(p.id, p.full_name || 'Unassigned'));

      setRows(
        list.map((r) => ({ ...r, agentName: names.get(r.user_id) || 'Unassigned' })),
      );
      setLoading(false);
    };
    load();
  }, [isAdmin, user, reloadKey]);

  const refresh = () => {
    setReloadKey((k) => k + 1);
    onPortalCreated();
  };

  const queue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q && !`${r.client_name ?? ''} ${r.email ?? ''} ${r.agentName ?? ''}`.toLowerCase().includes(q))
          return false;
        if (typeFilter !== 'all' && (r.client_type || '').toLowerCase() !== typeFilter) return false;
        if (agentFilter !== 'all' && r.agentName !== agentFilter) return false;
        return true;
      })
      // Oldest signed first so nobody sits unnoticed.
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
  }, [rows, search, typeFilter, agentFilter]);

  if (!loading && queue.length === 0) return null;

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-amber-500" />
          Needs a portal
          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">{queue.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Signed clients who don’t have a portal yet, oldest first.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking signed clients…
          </div>
        ) : (
          <div className="overflow-x-auto border border-border/50 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((r) => {
                  const isSeller = (r.client_type || '').toLowerCase() === 'seller';
                  return (
                    <TableRow key={r.id} className="border-border/50">
                      <TableCell>
                        <div className="font-medium">{r.client_name}</div>
                        <div className="text-xs text-muted-foreground">{r.email || 'No email on file'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.agentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {isSeller ? 'Seller' : 'Buyer'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {isSeller ? (
                          r.property_address || <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">Address TBD</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(r.updated_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <AgentPortalDialog
                          clientName={r.client_name}
                          clientEmail={r.email || undefined}
                          defaultType={isSeller ? 'seller' : 'buyer'}
                          defaultAgentId={r.user_id}
                          defaultPropertyAddress={isSeller ? r.property_address : null}
                          onSaved={onPortalCreated}
                          trigger={
                            <Button size="sm" className="gap-2">
                              <Plus className="h-4 w-4" />
                              Create portal
                            </Button>
                          }
                        />
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
  );
}
