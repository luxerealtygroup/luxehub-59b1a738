import { supabase } from '@/integrations/supabase/client';
import { CmaPdfInput } from './clientPdf';
import { tenant } from '@/config/tenant';

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
      createdAt: r.created_at,
      agentName,
      executiveSummary: r.approved_executive_summary ?? null,
      priceNarrative: r.approved_price_narrative ?? null,
      marketConditions: r.approved_market_conditions ?? r.market_narrative ?? null,
      strategy: r.approved_strategy ?? r.strategy_recommendation ?? null,
      pricingBandLow: r.pricing_band_low,
      pricingBandRecommended: r.pricing_band_recommended,
      pricingBandHigh: r.pricing_band_high,
      pricingConfidence: r.pricing_confidence,
      comps: Array.isArray(r.extracted_comps) ? r.extracted_comps : [],
    },
  };
}
