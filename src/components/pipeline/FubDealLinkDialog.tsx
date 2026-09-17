import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Link2, Search } from 'lucide-react';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { followUpBossApi, type FUBDeal } from '@/lib/api/followUpBoss';
import { logClientChanges } from '@/lib/pipelineAudit';

export interface LinkableClient {
  id: string;
  client_name: string;
  user_id: string;
  fub_deal_id?: number | null;
}

interface Props {
  client: LinkableClient;
  actorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

/**
 * Manual, one-way link from a LUXEhub client to a Follow Up Boss deal.
 * Nothing is matched automatically — not by name, not by email (buyer couples
 * routinely share one address). A person is searched for, chosen by hand, then
 * one of their deals is chosen by hand. Nothing is ever written back to FUB.
 */
export function FubDealLinkDialog({ client, actorId, open, onOpenChange, onLinked }: Props) {
  const { toast } = useToast();
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [deals, setDeals] = useState<FUBDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  const reset = () => {
    setPerson(null);
    setDeals([]);
  };

  const pickPerson = async (p: { id: number; name: string }) => {
    setPerson(p);
    setDeals([]);
    setLoading(true);
    const res = await followUpBossApi.getPersonDeals(p.id);
    setLoading(false);
    if (!res.success) {
      toast({
        title: 'Could not read Follow Up Boss',
        description: res.error || 'Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    setDeals(res.data?.deals ?? []);
  };

  const link = async (deal: FUBDeal) => {
    setSaving(deal.id);
    const { error } = await supabase
      .from('pipeline_clients')
      .update({
        fub_person_id: person?.id ?? null,
        fub_deal_id: deal.id,
        fub_deal_name: deal.name ?? null,
        fub_deal_pipeline: deal.pipelineName ?? null,
        fub_deal_stage: deal.stageName ?? null,
        fub_deal_price: deal.price ?? null,
        fub_deal_close_date: deal.projectedCloseDate ? deal.projectedCloseDate.slice(0, 10) : null,
        fub_deal_linked_by: actorId,
        fub_deal_synced_at: new Date().toISOString(),
      })
      .eq('id', client.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Could not link the deal', description: error.message, variant: 'destructive' });
      return;
    }
    await logClientChanges({
      clientId: client.id,
      ownerUserId: client.user_id,
      actorId,
      changes: [
        {
          field: 'fub_deal',
          old_value: client.fub_deal_id ? String(client.fub_deal_id) : null,
          new_value: `${deal.name || 'Deal'} (#${deal.id})`,
        },
      ],
    });
    toast({ title: 'Linked', description: `${client.client_name} is now connected to ${deal.name || 'this deal'}.` });
    reset();
    onOpenChange(false);
    onLinked();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect {client.client_name} to Follow Up Boss</DialogTitle>
          <DialogDescription>
            Search Follow Up Boss, choose the right person, then choose their deal. Follow Up Boss stays the source of
            truth — nothing is sent back to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              {person ? `Person: ${person.name}` : 'Step 1 — find the person'}
            </p>
            <FUBClientSearch
              onSelectClient={(p) => pickPerson({ id: p.id, name: p.name })}
              trigger={
                <Button variant="outline" className="gap-2">
                  <Search className="h-4 w-4" />
                  {person ? 'Choose a different person' : 'Search Follow Up Boss'}
                </Button>
              }
            />
          </div>

          {person && (
            <div>
              <p className="mb-2 text-sm font-medium">Step 2 — choose their deal</p>
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading their deals…
                </div>
              ) : deals.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  This person has no deals in Follow Up Boss yet. Once one is created there, come back and link it.
                </p>
              ) : (
                <ul className="space-y-2">
                  {deals.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.name || `Deal #${d.id}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {[d.pipelineName, d.stageName].filter(Boolean).join(' · ')}
                          {d.price ? ` · $${Math.round(d.price).toLocaleString()}` : ''}
                          {d.projectedCloseDate ? ` · closes ${d.projectedCloseDate.slice(0, 10)}` : ''}
                        </p>
                      </div>
                      <Button size="sm" className="gap-2 shrink-0" disabled={saving !== null} onClick={() => link(d)}>
                        {saving === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        Link
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!person && (
            <Badge variant="outline" className="text-xs">
              Nothing is linked automatically — you pick the record.
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
