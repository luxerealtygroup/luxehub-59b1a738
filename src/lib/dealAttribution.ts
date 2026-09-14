import { supabase } from '@/integrations/supabase/client';

/**
 * A Follow Up Boss deal lists everyone attached to it, including the operations
 * person who administers the paperwork. Production has to be credited to the
 * producing agent instead, so we keep an explicit override per deal.
 */
export interface DealAttribution {
  fubDealId: number;
  producingProfileId: string | null;
  producingFubUserId: number | null;
  producingName: string | null;
  adminProfileId: string | null;
  adminName: string | null;
  note: string | null;
}

export type DealAttributionMap = Map<number, DealAttribution>;

export async function fetchDealAttribution(): Promise<DealAttributionMap> {
  const map: DealAttributionMap = new Map();
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase
      .from('deal_metadata' as any)
      .select('fub_deal_id, producing_agent_id, transaction_admin_id, attribution_note'),
    supabase.from('profiles').select('id, full_name, fub_user_id'),
  ]);

  const byProfile = new Map<string, { name: string | null; fubUserId: number | null }>();
  (profiles || []).forEach((p: any) => {
    byProfile.set(p.id, { name: p.full_name ?? null, fubUserId: p.fub_user_id ?? null });
  });

  (rows as any[] | null)?.forEach((row) => {
    if (!row?.producing_agent_id && !row?.transaction_admin_id) return;
    const producing = row.producing_agent_id ? byProfile.get(row.producing_agent_id) : undefined;
    const admin = row.transaction_admin_id ? byProfile.get(row.transaction_admin_id) : undefined;
    map.set(Number(row.fub_deal_id), {
      fubDealId: Number(row.fub_deal_id),
      producingProfileId: row.producing_agent_id ?? null,
      producingFubUserId: producing?.fubUserId ?? null,
      producingName: producing?.name ?? null,
      adminProfileId: row.transaction_admin_id ?? null,
      adminName: admin?.name ?? null,
      note: row.attribution_note ?? null,
    });
  });

  return map;
}

/**
 * Who should be credited for this deal. Falls back to the Follow Up Boss data
 * only when no producing agent has been recorded.
 */
export function resolveProducingAgent(
  deal: any,
  attribution?: DealAttributionMap,
): { fubUserId: number | null; name: string | null } {
  const override = attribution?.get(Number(deal?.id));
  if (override?.producingFubUserId != null) {
    return { fubUserId: override.producingFubUserId, name: override.producingName };
  }
  const assignedId: number | null = deal?.assignedUserId ?? deal?.userId ?? null;
  const users: any[] = Array.isArray(deal?.users) ? deal.users : [];
  const match = users.find((u) => assignedId != null && u?.id === assignedId) || users[0] || null;
  return { fubUserId: match?.id ?? assignedId ?? null, name: match?.name ?? null };
}

/** True when this deal's production belongs to the given Follow Up Boss user. */
export function isDealCreditedTo(
  deal: any,
  fubUserId: number,
  attribution?: DealAttributionMap,
): boolean {
  const override = attribution?.get(Number(deal?.id));
  if (override?.producingFubUserId != null) return override.producingFubUserId === fubUserId;
  const users: any[] = Array.isArray(deal?.users) ? deal.users : [];
  return (
    users.some((u: any) => u?.id === fubUserId) ||
    deal?.assignedUserId === fubUserId ||
    deal?.userId === fubUserId
  );
}
