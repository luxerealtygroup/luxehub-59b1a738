/**
 * Weighted Deal Units — shared helper used across the entire application.
 *
 * Sale/buy = 1.0 deal unit
 * Lease/rental = 0.3333 deal unit
 *
 * 3 lease deals ≈ 1.0 deal unit.
 */

export const LEASE_WEIGHT = 1 / 3; // 0.3333
export const SALE_WEIGHT = 1.0;

export type DealCategory = 'sale' | 'lease';
export type DealCategorySource = 'db' | 'fub' | 'manual' | 'inferred';

export interface DealCategoryResult {
  category: DealCategory;
  source: DealCategorySource;
}

/** Keywords that indicate a lease / rental deal */
const LEASE_KEYWORDS = ['lease', 'rental', 'rent', 'tenant', 'leasing'];

/**
 * Metadata lookup map type — keyed by fub_deal_id.
 * Pass this from useDealMetadata hook.
 */
export type DealMetadataMap = Map<number, {
  deal_category: 'sale' | 'lease';
  weight_override: number | null;
}>;

/**
 * Infer whether a deal is a lease or sale.
 *
 * Priority:
 *  1. deal_metadata table (via metadataMap) → 'db'
 *  2. Explicit `deal_category` field (from pipeline_clients) → 'manual'
 *  3. FUB pipeline/deal name keywords → 'fub'
 *  4. Keyword inference from name/stage → 'inferred'
 *  5. Default → sale
 */
export function inferDealCategory(deal: {
  id?: number;
  deal_category?: string | null;
  pipelineName?: string | null;
  name?: string | null;
  stageName?: string | null;
  [key: string]: any;
}, metadataMap?: DealMetadataMap): DealCategoryResult {
  // 1. Check deal_metadata table first (highest priority)
  if (metadataMap && deal.id) {
    const meta = metadataMap.get(deal.id);
    if (meta) {
      return { category: meta.deal_category, source: 'db' };
    }
  }

  // 2. Explicit field from our database (pipeline_clients)
  if (deal.deal_category === 'lease') return { category: 'lease', source: 'manual' };
  if (deal.deal_category === 'sale') return { category: 'sale', source: 'manual' };

  // 3. FUB pipeline name
  const pipeline = (deal.pipelineName || '').toLowerCase();
  if (LEASE_KEYWORDS.some(kw => pipeline.includes(kw))) {
    return { category: 'lease', source: 'fub' };
  }

  // 4. Deal name / stage name keyword inference
  const nameAndStage = `${deal.name || ''} ${deal.stageName || ''}`.toLowerCase();
  if (LEASE_KEYWORDS.some(kw => nameAndStage.includes(kw))) {
    return { category: 'lease', source: 'inferred' };
  }

  // 5. Default to sale
  return { category: 'sale', source: 'manual' };
}

/**
 * Returns the weight multiplier for a deal.
 * If deal_metadata has weight_override, use that.
 * Lease = 0.3333, Sale = 1.0
 */
export function getDealWeight(
  deal: Parameters<typeof inferDealCategory>[0],
  metadataMap?: DealMetadataMap,
): number {
  // Check for weight_override in deal_metadata
  if (metadataMap && deal.id) {
    const meta = metadataMap.get(deal.id);
    if (meta?.weight_override != null) return meta.weight_override;
  }

  const { category } = inferDealCategory(deal, metadataMap);
  return category === 'lease' ? LEASE_WEIGHT : SALE_WEIGHT;
}

/**
 * Sum weighted deal units for an array of deals.
 */
export function sumWeightedDeals(
  deals: Parameters<typeof inferDealCategory>[0][],
  metadataMap?: DealMetadataMap,
): number {
  return deals.reduce((sum, deal) => sum + getDealWeight(deal, metadataMap), 0);
}

/**
 * Debug breakdown for weighted deal metrics.
 */
export interface WeightedDebugInfo {
  rawCount: number;
  weightedCount: number;
  leaseCount: number;
  saleCount: number;
  leaseDetection: {
    db: number;
    fub: number;
    manual: number;
    inferred: number;
  };
}

/**
 * Build debug info for a set of deals.
 */
export function buildWeightedDebug(
  deals: Parameters<typeof inferDealCategory>[0][],
  metadataMap?: DealMetadataMap,
): WeightedDebugInfo {
  let leaseCount = 0;
  let saleCount = 0;
  const detection = { db: 0, fub: 0, manual: 0, inferred: 0 };
  let weightedCount = 0;

  for (const deal of deals) {
    const result = inferDealCategory(deal, metadataMap);
    const weight = getDealWeight(deal, metadataMap);
    weightedCount += weight;

    if (result.category === 'lease') {
      leaseCount++;
      detection[result.source]++;
    } else {
      saleCount++;
    }
  }

  return {
    rawCount: deals.length,
    weightedCount: Math.round(weightedCount * 100) / 100,
    leaseCount,
    saleCount,
    leaseDetection: detection,
  };
}

/**
 * Format weighted deal count for display.
 * e.g. 4.33 → "4.33" or 5.0 → "5"
 */
export function formatWeightedDeals(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}
