import { supabase } from '@/integrations/supabase/client';
import { CmaPdfInput } from './clientPdf';
import { tenant } from '@/config/tenant';
import { cleanText, normalizeMarketStats } from '@/lib/cma/reportQuality';

export interface LoadedCmaSend {
  input: CmaPdfInput;
  clientName: string | null;
  previousDocumentId: string | null;
  previousSentAt: string | null;
}

/**
 * Builds the client-facing CMA document straight from the saved report, so the
 * "Send to client portal" button works from the report list as well as from
 * inside the client report view. Approved wording wins; the AI draft is the
 * fallback, exactly as the on-screen report does it.
 */
export async function loadCmaPdfInput(reportId: string): Promise<LoadedCmaSend> {
  const { data, error } = await supabase
    .from('cma_reports')
    .select('*')
    .eq('id', reportId)
    .single();
  if (error || !data) throw error || new Error('Report not found');
  const r = data as any;
  const rawStats = r.ai_raw_response && typeof r.ai_raw_response === 'object'
    ? (r.ai_raw_response as Record<string, unknown>).market_stats_derived as Record<string, unknown> | undefined
    : undefined;
  const strategyFromTalkingPoints = Array.isArray(r.talking_points)
    ? r.talking_points.map((point: unknown) => cleanText(point)).filter(Boolean).join('\n')
    : '';

  let agentName: string = tenant.brokerageName;
  if (r.user_id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', r.user_id)
      .maybeSingle();
    if ((prof as any)?.full_name) agentName = (prof as any).full_name;
  }

  return {
    clientName: r.fub_person_name ?? null,
    previousDocumentId: r.portal_document_id ?? null,
    previousSentAt: r.portal_sent_at ?? null,
    input: {
      propertyAddress: r.property_address,
      cityArea: r.city_area,
      propertyType: r.property_type,
      createdAt: r.created_at,
      agentName,
      clientName: r.fub_person_name ?? null,
      executiveSummary: r.approved_executive_summary ?? null,
      priceNarrative: r.approved_price_narrative ?? null,
      marketConditions: r.approved_market_conditions ?? r.market_narrative ?? null,
      strategy: r.approved_strategy ?? strategyFromTalkingPoints || null,
      pricingBandLow: r.pricing_band_low,
      pricingBandRecommended: r.pricing_band_recommended,
      pricingBandHigh: r.pricing_band_high,
      pricingConfidence: r.pricing_confidence,
      cmaGrade: r.cma_grade,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      aboveGradeSqFt: r.above_grade_sqft,
      finishedBasementSqFt: r.finished_basement_sqft,
      approxSqFt: r.approx_sqft,
      garage: r.garage,
      buildYear: r.build_year,
      condition: r.condition,
      keyFeatures: Array.isArray(r.key_features) ? r.key_features : [],
      featureAdjustments: Array.isArray(r.feature_adjustments) ? r.feature_adjustments : [],
      pricePerSqftCrossCheck: r.price_per_sqft_cross_check ?? null,
      valuationScenarios: r.valuation_scenarios ?? null,
      marketStats: normalizeMarketStats(rawStats ?? {
        median_sale_price: r.median_sale_price,
        avg_days_on_market: r.avg_days_on_market,
        sale_to_list_ratio: r.sale_to_list_ratio,
        months_of_inventory: r.months_of_inventory,
        active_listings: r.active_listings,
        sold_listings: r.sold_listings,
      }),
      compPriceAnomalyConfirmedAt: r.comp_price_anomaly_confirmed_at ?? null,
      comps: Array.isArray(r.extracted_comps) ? r.extracted_comps : [],
    },
  };
}
