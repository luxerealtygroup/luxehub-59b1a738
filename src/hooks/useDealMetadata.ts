import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealMetadataRow {
  id: string;
  fub_deal_id: number;
  deal_category: 'sale' | 'lease';
  weight_override: number | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches all deal_metadata rows and provides a lookup map by fub_deal_id.
 * Also exposes an upsert function for changing deal types.
 */
export function useDealMetadata() {
  const [metadata, setMetadata] = useState<Map<number, DealMetadataRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('deal_metadata' as any)
      .select('*');
    if (!error && data) {
      const map = new Map<number, DealMetadataRow>();
      (data as any[]).forEach(row => {
        map.set(row.fub_deal_id, row as DealMetadataRow);
      });
      setMetadata(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const upsertDealCategory = useCallback(async (
    fubDealId: number,
    category: 'sale' | 'lease',
    userId: string,
    weightOverride?: number | null,
  ) => {
    const existing = metadata.get(fubDealId);
    if (existing) {
      const { error } = await supabase
        .from('deal_metadata' as any)
        .update({
          deal_category: category,
          weight_override: weightOverride ?? null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('fub_deal_id', fubDealId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('deal_metadata' as any)
        .insert({
          fub_deal_id: fubDealId,
          deal_category: category,
          weight_override: weightOverride ?? null,
          updated_by: userId,
        } as any);
      if (error) throw error;
    }
    // Update local cache
    setMetadata(prev => {
      const next = new Map(prev);
      next.set(fubDealId, {
        ...(existing || { id: '', created_at: new Date().toISOString() }),
        fub_deal_id: fubDealId,
        deal_category: category,
        weight_override: weightOverride ?? null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      } as DealMetadataRow);
      return next;
    });
  }, [metadata]);

  const bulkUpsert = useCallback(async (
    fubDealIds: number[],
    category: 'sale' | 'lease',
    userId: string,
  ) => {
    for (const id of fubDealIds) {
      await upsertDealCategory(id, category, userId);
    }
  }, [upsertDealCategory]);

  return { metadata, loading, refetch: fetchAll, upsertDealCategory, bulkUpsert };
}
