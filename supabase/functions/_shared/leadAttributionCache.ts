import { attribute, type AttributionMeta, type AttributionResult } from './leadAttribution.ts';

const MAX_AGE_MS = 6 * 3600 * 1000;

/** Returns the saved attribution if fresh, otherwise recomputes from FUB (read-only) and saves it. */
export async function getAttribution(db: any, orgId: string, h: Record<string, string>, deals: any[], md: any[], force = false): Promise<AttributionResult> {
  if (!force) {
    const { data } = await db.from('lead_attribution_cache').select('result, computed_at').eq('org_id', orgId).maybeSingle();
    if (data && Date.now() - new Date(data.computed_at).getTime() < MAX_AGE_MS && data.result?.table) return data.result;
  }
  const meta = new Map<number, AttributionMeta>();
  for (const m of md) meta.set(Number(m.fub_deal_id), { category: m.deal_category, personal: !!m.personal_transaction, doubleEnd: !!m.double_end });
  const result = await attribute(h, deals, meta, 2026);
  await db.from('lead_attribution_cache').upsert({ org_id: orgId, plan_year: 2026, result, computed_at: result.as_of });
  return result;
}
