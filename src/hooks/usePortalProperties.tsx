import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PropertyRole = 'listing' | 'purchase' | 'watching';
export type TransactionSide = 'buy' | 'sell';

export interface PortalProperty {
  id: string;
  portal_id: string;
  address: string | null;
  mls_number: string | null;
  property_type: string | null;
  cover_photo_url: string | null;
  display_order: number;
  role: PropertyRole;
  notes: string | null;
  created_at: string;
}

export interface PortalTransaction {
  id: string;
  portal_id: string;
  property_id: string | null;
  side: TransactionSide;
  status: string;
  price: number | null;
  offer_date: string | null;
  conditions_date: string | null;
  firm_date: string | null;
  deposit_due_date: string | null;
  requisition_date: string | null;
  closing_date: string | null;
  fub_deal_id: number | null;
  deal_id: string | null;
  notes: string | null;
}

export const ROLE_LABEL: Record<PropertyRole, string> = {
  listing: 'Listing / Sale',
  purchase: 'Purchase',
  watching: 'Saved / Watching',
};

/** Human label for a property, tolerant of the address not being filled in yet. */
export function propertyLabel(p: PortalProperty) {
  return p.address?.trim() || `${ROLE_LABEL[p.role]} (address to be added)`;
}

/**
 * Buyer / Seller / Buyer + Seller, derived from the portal's transactions.
 * Falls back to the legacy client_type when a portal has no transactions yet.
 */
export function derivePortalSideLabel(
  transactions: Pick<PortalTransaction, 'side'>[],
  fallbackClientType?: string | null,
) {
  const buy = transactions.some((t) => t.side === 'buy');
  const sell = transactions.some((t) => t.side === 'sell');
  if (buy && sell) return 'Buyer + Seller';
  if (buy) return 'Buyer';
  if (sell) return 'Seller';
  if (fallbackClientType) return fallbackClientType.charAt(0).toUpperCase() + fallbackClientType.slice(1);
  return '—';
}

export function usePortalProperties(portalId: string | null | undefined) {
  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [transactions, setTransactions] = useState<PortalTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!portalId) {
      setProperties([]);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [propsRes, txRes] = await Promise.all([
      supabase
        .from('portal_properties')
        .select('*')
        .eq('portal_id', portalId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('portal_transactions').select('*').eq('portal_id', portalId),
    ]);
    setProperties(((propsRes.data as PortalProperty[]) ?? []));
    setTransactions(((txRes.data as PortalTransaction[]) ?? []));
    setLoading(false);
  }, [portalId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const transactionsByProperty = useMemo(() => {
    const map = new Map<string, PortalTransaction[]>();
    transactions.forEach((t) => {
      if (!t.property_id) return;
      map.set(t.property_id, [...(map.get(t.property_id) ?? []), t]);
    });
    return map;
  }, [transactions]);

  const activeProperties = useMemo(() => properties.filter((p) => p.role !== 'watching'), [properties]);
  const watchedProperties = useMemo(() => properties.filter((p) => p.role === 'watching'), [properties]);

  return {
    properties,
    activeProperties,
    watchedProperties,
    transactions,
    transactionsByProperty,
    loading,
    reload,
    sideLabel: derivePortalSideLabel(transactions),
  };
}
