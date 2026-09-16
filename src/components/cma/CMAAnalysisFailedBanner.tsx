import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  reportId: string;
  /** true when the run is still within the timeout window */
  running?: boolean;
  hasPreviousAnalysis: boolean;
  startedAt?: string | null;
  errorMessage?: string | null;
  onUpdate: () => void;
  canRetry?: boolean;
}

/**
 * Rebuilds the analysis request from the stored record so an agent can retry a
 * run that died mid-flight without re-entering the whole form.
 */
export const retryCmaAnalysis = async (reportId: string) => {
  const { data: r, error } = await supabase
    .from('cma_reports')
    .select('*')
    .eq('id', reportId)
    .single();
  if (error || !r) throw error || new Error('Report not found');

  const rec = r as any;
  const comps = Array.isArray(rec.extracted_comps) ? rec.extracted_comps : [];

  await supabase
    .from('cma_reports')
    .update({
      analysis_status: 'processing',
      analysis_started_at: new Date().toISOString(),
      analysis_error: null,
    } as any)
    .eq('id', reportId);

  const body = {
    pdfText: '',
    subjectProperty: {
      address: rec.property_address,
      city: rec.city_area,
      type: rec.property_type,
      beds: rec.bedrooms ?? null,
      baths: rec.bathrooms ?? null,
      sqft: rec.approx_sqft ?? null,
      targetPrice: rec.target_list_price ?? null,
      aboveGradeSqFt: rec.above_grade_sqft ?? null,
      finishedBasementSqFt: rec.finished_basement_sqft ?? null,
      garage: rec.garage ?? null,
      buildYear: rec.build_year ? String(rec.build_year) : null,
      condition: rec.condition ?? null,
      keyFeatures: Array.isArray(rec.key_features) ? rec.key_features : [],
    },
    purchaseHistory: {
      purchasePrice: rec.purchase_price ?? null,
      purchaseDate: rec.purchase_date ?? null,
      improvements: rec.improvements_invested ?? 0,
    },
    agentNotes: rec.agent_notes ?? null,
    marketStats: {
      method: rec.stats_method,
      dateRange: rec.stats_date_range,
      activeListings: rec.active_listings ?? null,
      soldListings: rec.sold_listings ?? null,
      medianSalePrice: rec.median_sale_price ?? null,
      avgDOM: rec.avg_days_on_market ?? null,
      saleToListRatio: rec.sale_to_list_ratio ?? null,
      monthsOfInventory: rec.months_of_inventory ?? null,
      notes: rec.market_notes ?? null,
      pastedText: rec.stats_pasted_text ?? null,
    },
    existingManualComps: comps.filter((c: any) => c?._manual_edit),
    reviewedComps: comps,
  };

  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-analyze', { body });
    if (fnError) throw fnError;
    if (!fnData?.success || !fnData.analysis) {
      throw new Error(fnData?.error || 'The analysis service did not return a result.');
    }

    const a = fnData.analysis;
    const pp = Number(rec.purchase_price) || 0;
    const imp = Number(rec.improvements_invested) || 0;

    await supabase
      .from('cma_reports')
      .update({
        analysis_status: 'completed',
        analysis_error: null,
        cma_grade: a.cma_grade,
        pricing_band_low: a.pricing_band_low,
        pricing_band_recommended: a.pricing_band_recommended,
        pricing_band_high: a.pricing_band_high,
        pricing_confidence: a.pricing_confidence,
        risk_flags: a.risk_flags || [],
        weak_comp_alerts: a.weak_comp_alerts || [],
        adjustment_observations: a.adjustment_observations || [],
        feature_adjustments: a.feature_adjustments || [],
        price_per_sqft_cross_check: a.price_per_sqft_cross_check ?? null,
        valuation_scenarios: a.valuation_scenarios ?? null,
        talking_points: a.talking_points || [],
        seller_objections: a.seller_objections || [],
        strategy_recommendation: a.strategy_recommendation,
        market_narrative: a.market_narrative,
        equity_gain_low: a.pricing_band_low && pp ? a.pricing_band_low - pp - imp : null,
        equity_gain_high: a.pricing_band_high && pp ? a.pricing_band_high - pp - imp : null,
        ai_raw_response: a,
      } as any)
      .eq('id', reportId);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The analysis run failed.';
    await supabase
      .from('cma_reports')
      .update({ analysis_status: 'error', analysis_error: message } as any)
      .eq('id', reportId);
    throw e;
  }
};

const CMAAnalysisFailedBanner = ({
  reportId,
  running,
  hasPreviousAnalysis,
  startedAt,
  errorMessage,
  onUpdate,
  canRetry = true,
}: Props) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryCmaAnalysis(reportId);
      toast.success('Analysis complete.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The analysis failed again.');
    } finally {
      setRetrying(false);
      onUpdate();
    }
  };

  const started = startedAt ? new Date(startedAt) : null;

  return (
    <Card className={running ? 'border-amber-500/30' : 'border-destructive/30'}>
      <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {running ? (
            <Loader2 className="h-5 w-5 animate-spin text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${running ? 'text-amber-500' : 'text-destructive'}`}>
              {running
                ? 'A new analysis is running.'
                : 'The most recent analysis run did not finish.'}
            </p>
            <p className="text-xs text-muted-foreground">
              {running
                ? 'The results below are from the last completed analysis until the new one lands.'
                : hasPreviousAnalysis
                  ? 'Showing the last completed analysis below. Press Retry to run it again.'
                  : 'No completed analysis is available for this property yet. Press Retry to run it.'}
              {started && ` Started ${started.toLocaleString()}.`}
            </p>
            {errorMessage && !running && (
              <p className="text-xs text-destructive/80 mt-1 break-words">{errorMessage}</p>
            )}
          </div>
        </div>
        {canRetry && !running && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
            className="border-gold/30 text-gold hover:bg-gold/10 shrink-0"
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {retrying ? 'Running…' : 'Retry analysis'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default CMAAnalysisFailedBanner;
