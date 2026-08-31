import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Building2, Loader2, RefreshCw } from 'lucide-react';
import { followUpBossApi, type FUBDeal } from '@/lib/api/followUpBoss';
import { formatDealPrice, looksLikeAddress } from '@/lib/fubDeal';
import { FubDealImportDialog } from '@/components/portal/FubDealImportDialog';

interface Props {
  portalId: string;
  fubPersonId: number | null;
  /** fub_deal_ids already attached to a transaction on this portal. */
  linkedDealIds: number[];
  onSaved?: () => void;
}

/** Selectable cards of the linked FUB person's deals. Nothing is written until confirmed. */
export function FubDealPicker({ portalId, fubPersonId, linkedDealIds, onSaved }: Props) {
  const [deals, setDeals] = useState<FUBDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FUBDeal | null>(null);

  const load = useCallback(async () => {
    if (!fubPersonId) {
      setDeals([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await followUpBossApi.getPersonDeals(fubPersonId);
      if (res.success && res.data?.deals) setDeals(res.data.deals);
      else {
        setDeals([]);
        setError(res.error ?? 'Could not load deals from Follow Up Boss.');
      }
    } catch (e) {
      setDeals([]);
      setError(e instanceof Error ? e.message : 'Could not load deals from Follow Up Boss.');
    } finally {
      setLoading(false);
    }
  }, [fubPersonId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!fubPersonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Link a Follow Up Boss contact above to pull their deals in.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Deals in Follow Up Boss for this contact. Picking one drafts a property — you confirm the address before it saves.
        </p>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && deals.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No deals in Follow Up Boss for this contact yet — this portal can stay in home-search mode until there is one.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {deals.map((d) => {
          const linked = linkedDealIds.includes(d.id);
          const personNamed = !looksLikeAddress(d.name) && !d.propertyStreet;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setPicked(d)}
              className="text-left rounded-xl border border-border/70 p-3 hover:border-primary/50 hover:bg-primary/[0.03] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{d.name || `Deal #${d.id}`}</p>
                {linked && <Badge variant="outline" className="text-[10px] shrink-0">On portal</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">{d.pipelineName || 'Pipeline ?'}</Badge>
                <Badge variant="outline" className="text-[10px]">{d.stageName || 'Stage ?'}</Badge>
                <span>{formatDealPrice(d.price)}</span>
                {d.projectedCloseDate && <span>• closes {d.projectedCloseDate.slice(0, 10)}</span>}
              </div>
              {personNamed ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This deal is named after a person, not an address — set the address manually.
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Address prefills from the deal name — editable.
                </p>
              )}
            </button>
          );
        })}
      </div>

      <FubDealImportDialog
        portalId={portalId}
        deal={picked}
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
        onSaved={onSaved}
      />
    </div>
  );
}
