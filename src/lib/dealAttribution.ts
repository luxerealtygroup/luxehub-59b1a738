import { supabase } from '@/integrations/supabase/client';

/**
 * A Follow Up Boss deal lists everyone attached to it, including the operations
 * person who administers the paperwork. Production has to be credited to the
 * producing agent instead, so we keep an explicit override per deal.
 *
 * A deal can be split between two producing agents (default 100/0). Every
 * per-agent money figure credits each agent their share, never the whole deal
 * to one of them.
 */
export interface DealShare {
  profileId: string | null;
  fubUserId: number | null;
  name: string | null;
  /** 0-100. The two shares on a deal always total 100. */
  percent: number;
}

export interface DealAttribution {
  fubDealId: number;
  producingProfileId: string | null;
  producingFubUserId: number | null;
  producingName: string | null;
  coProfileId: string | null;
  coFubUserId: number | null;
  coName: string | null;
  /** Primary agent's share, 0-100. */
  splitPercent: number;
  shares: DealShare[];
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
      .select(
        'fub_deal_id, producing_agent_id, producing_agent_2_id, producing_split_percent, transaction_admin_id, attribution_note',
      ),
    supabase.from('profiles').select('id, full_name, fub_user_id'),
  ]);

  const byProfile = new Map<string, { name: string | null; fubUserId: number | null }>();
  (profiles || []).forEach((p: any) => {
    byProfile.set(p.id, { name: p.full_name ?? null, fubUserId: p.fub_user_id ?? null });
  });

  (rows as any[] | null)?.forEach((row) => {
    if (!row?.producing_agent_id && !row?.transaction_admin_id) return;
    const producing = row.producing_agent_id ? byProfile.get(row.producing_agent_id) : undefined;
    const co = row.producing_agent_2_id ? byProfile.get(row.producing_agent_2_id) : undefined;
    const admin = row.transaction_admin_id ? byProfile.get(row.transaction_admin_id) : undefined;
    const rawPercent = Number(row.producing_split_percent ?? 100);
    const splitPercent = row.producing_agent_2_id
      ? Math.min(100, Math.max(0, isFinite(rawPercent) ? rawPercent : 100))
      : 100;

    const shares: DealShare[] = [];
    if (row.producing_agent_id) {
      shares.push({
        profileId: row.producing_agent_id,
        fubUserId: producing?.fubUserId ?? null,
        name: producing?.name ?? null,
        percent: splitPercent,
      });
    }
    if (row.producing_agent_2_id) {
      shares.push({
        profileId: row.producing_agent_2_id,
        fubUserId: co?.fubUserId ?? null,
        name: co?.name ?? null,
        percent: 100 - splitPercent,
      });
    }

    map.set(Number(row.fub_deal_id), {
      fubDealId: Number(row.fub_deal_id),
      producingProfileId: row.producing_agent_id ?? null,
      producingFubUserId: producing?.fubUserId ?? null,
      producingName: producing?.name ?? null,
      coProfileId: row.producing_agent_2_id ?? null,
      coFubUserId: co?.fubUserId ?? null,
      coName: co?.name ?? null,
      splitPercent,
      shares,
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

/**
 * Everyone who earned a piece of this deal, with their share. One entry at 100%
 * when there is no split, so callers can always just loop.
 */
export function resolveDealShares(deal: any, attribution?: DealAttributionMap): DealShare[] {
  const override = attribution?.get(Number(deal?.id));
  if (override && override.shares.length) return override.shares;
  const single = resolveProducingAgent(deal, attribution);
  return [{ profileId: null, fubUserId: single.fubUserId, name: single.name, percent: 100 }];
}

/** This agent's fraction (0-1) of the deal. 0 when they did not produce it. */
export function dealShareFor(
  deal: any,
  fubUserId: number,
  attribution?: DealAttributionMap,
): number {
  const override = attribution?.get(Number(deal?.id));
  if (override && override.shares.length) {
    const mine = override.shares.find((s) => s.fubUserId === fubUserId);
    return mine ? mine.percent / 100 : 0;
  }
  const users: any[] = Array.isArray(deal?.users) ? deal.users : [];
  const credited =
    users.some((u: any) => u?.id === fubUserId) ||
    deal?.assignedUserId === fubUserId ||
    deal?.userId === fubUserId;
  return credited ? 1 : 0;
}

/** True when this deal's production belongs, in whole or in part, to the given user. */
export function isDealCreditedTo(
  deal: any,
  fubUserId: number,
  attribution?: DealAttributionMap,
): boolean {
  return dealShareFor(deal, fubUserId, attribution) > 0;
}
