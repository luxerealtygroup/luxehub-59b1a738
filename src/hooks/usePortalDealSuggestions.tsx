import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { followUpBossApi, type FUBDeal } from '@/lib/api/followUpBoss';

export interface DealSuggestion {
  deal: FUBDeal;
  /** null on first sight of a deal we've never recorded. */
  previousStage: string | null;
}

interface StateRow {
  fub_deal_id: number;
  last_seen_stage: string | null;
  dismissed_stage: string | null;
  linked_property_id: string | null;
}

/**
 * On-demand (no background job) check of a linked FUB person's deals.
 * Surfaces an agent-only suggestion when a deal has moved stage since we last
 * saw it, or when a deal exists that isn't on the portal yet. Nothing reaches
 * the client until the agent confirms.
 */
export function usePortalDealSuggestions(portalId: string | null, fubPersonId: number | null) {
  const [suggestions, setSuggestions] = useState<DealSuggestion[]>([]);
  const [linkedDealIds, setLinkedDealIds] = useState<number[]>([]);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!portalId || !fubPersonId) {
      setSuggestions([]);
      setLinkedDealIds([]);
      return;
    }
    setChecking(true);
    try {
      const [dealsRes, stateRes, txRes] = await Promise.all([
        followUpBossApi.getPersonDeals(fubPersonId),
        supabase
          .from('portal_fub_deals')
          .select('fub_deal_id,last_seen_stage,dismissed_stage,linked_property_id')
          .eq('portal_id', portalId),
        supabase.from('portal_transactions').select('fub_deal_id').eq('portal_id', portalId),
      ]);

      const deals = (dealsRes.success && dealsRes.data?.deals) || [];
      const state = new Map<number, StateRow>();
      ((stateRes.data as StateRow[]) ?? []).forEach((r) => state.set(Number(r.fub_deal_id), r));
      const onPortal = new Set<number>(
        ((txRes.data as { fub_deal_id: number | null }[]) ?? [])
          .map((t) => t.fub_deal_id)
          .filter((v): v is number => typeof v === 'number'),
      );
      setLinkedDealIds([...onPortal]);

      const next: DealSuggestion[] = [];
      const upserts: Record<string, unknown>[] = [];

      for (const d of deals) {
        const prior = state.get(d.id);
        const stage = d.stageName ?? null;
        const stageMoved = !!prior && prior.last_seen_stage !== stage;
        const firstSight = !prior;
        const dismissed = prior?.dismissed_stage === stage;

        // Only worth suggesting if this deal isn't already a property on the portal.
        if (!onPortal.has(d.id) && !dismissed && (stageMoved || firstSight)) {
          next.push({ deal: d, previousStage: prior?.last_seen_stage ?? null });
        }

        if (firstSight || prior?.last_seen_stage !== stage || prior?.deal_name_changed) {
          upserts.push({
            portal_id: portalId,
            fub_deal_id: d.id,
            deal_name: d.name,
            pipeline_name: d.pipelineName,
            last_seen_stage: stage,
            dismissed_stage: prior?.dismissed_stage ?? null,
            linked_property_id: prior?.linked_property_id ?? null,
          });
        }
      }

      if (upserts.length) {
        await supabase.from('portal_fub_deals').upsert(upserts, { onConflict: 'portal_id,fub_deal_id' });
      }
      setSuggestions(next);
    } finally {
      setChecking(false);
    }
  }, [portalId, fubPersonId]);

  useEffect(() => {
    void check();
  }, [check]);

  const dismiss = useCallback(
    async (dealId: number, stage: string | null) => {
      if (!portalId) return;
      setSuggestions((s) => s.filter((x) => x.deal.id !== dealId));
      await supabase
        .from('portal_fub_deals')
        .update({ dismissed_stage: stage })
        .eq('portal_id', portalId)
        .eq('fub_deal_id', dealId);
    },
    [portalId],
  );

  return { suggestions, linkedDealIds, checking, recheck: check, dismiss };
}
