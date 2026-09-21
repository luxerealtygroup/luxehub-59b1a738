import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, Loader2, TrendingUp, BarChart3, Home, Target, ArrowRight, Phone } from 'lucide-react';
import CMAFubPush from './CMAFubPush';
import { CMASendToPortal } from './CMASendToPortal';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { buildCmaClientPdf, type CmaPdfInput } from '@/lib/cma/clientPdf';
import { safeFileName } from '@/lib/portalDelivery';
import {
  anomalyMessage,
  cleanText,
  compPrice,
  compStatus,
  detectDuplicateSoldPriceAnomaly,
  humanizeLabel,
  money,
  normalizeAddress,
  sqftLabel,
  toPositiveNumber,
} from '@/lib/cma/reportQuality';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, ReferenceLine,
} from 'recharts';
import { tenant } from '@/config/tenant';

interface Comp {
  address: string;
  area: string;
  beds: number | null;
  baths: number | null;
  list_price: number | null;
  sold_price: number | null;
  days_on_market: number | null;
  sale_date: string | null;
  comp_category?: string | null;
  is_weak: boolean;
  weak_reason: string | null;
  sqft?: number | string | null;
  sqFt?: number | string | null;
  ag_sqft?: number | string | null;
  bg_sqft?: number | string | null;
  notes?: string | null;
}

interface CMAReportFull {
  id: string;
  property_address: string;
  city_area: string;
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  approx_sqft: number | null;
  above_grade_sqft?: number | null;
  finished_basement_sqft?: number | null;
  garage?: string | null;
  build_year?: number | string | null;
  condition?: string | null;
  key_features?: string[];
  target_list_price: number | null;
  purchase_price: number;
  purchase_date: string;
  improvements_invested: number;
  improvements_list: Array<{ description: string; amount: number; date?: string }>;
  analysis_status: string;
  cma_grade: string | null;
  pricing_band_low: number | null;
  pricing_band_recommended: number | null;
  pricing_band_high: number | null;
  pricing_confidence: string | null;
  risk_flags: string[];
  weak_comp_alerts: string[];
  adjustment_observations: string[];
  talking_points: string[];
  seller_objections: Array<{ objection: string; response: string }>;
  strategy_recommendation: string | null;
  market_narrative: string | null;
  extracted_comps: Comp[];
  equity_gain_low: number | null;
  equity_gain_high: number | null;
  active_listings: number | null;
  sold_listings: number | null;
  median_sale_price: number | null;
  avg_days_on_market: number | null;
  sale_to_list_ratio: number | null;
  months_of_inventory: number | null;
  created_at: string;
  fub_person_id: number | null;
  fub_person_name: string | null;
  subject_photos: string[];
  cover_photo_index: number;
  approval_status: string;
  approved_executive_summary: string | null;
  approved_price_narrative: string | null;
  approved_strategy: string | null;
  approved_market_conditions: string | null;
  feature_adjustments?: Array<{ feature?: string; adjustment_low?: number | null; adjustment_high?: number | null; rationale?: string | null }>;
  price_per_sqft_cross_check?: any;
  valuation_scenarios?: any;
  comp_price_anomaly_confirmed_at?: string | null;
  user_id?: string | null;
  portal_document_id?: string | null;
  portal_sent_at?: string | null;
}

const CMAClientReport = ({ reportId }: { reportId: string }) => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [report, setReport] = useState<CMAReportFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPdf, setSavingPdf] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [agentName, setAgentName] = useState<string>('');
  const [portalSentAt, setPortalSentAt] = useState<string | null>(null);


  useEffect(() => {
    const fetchReport = async () => {
      const { data, error } = await supabase
        .from('cma_reports')
        .select('*')
        .eq('id', reportId)
        .single();
      if (error) {
        toast.error('Failed to load report');
        console.error(error);
      } else {
        const r = data as any;
        const reportData = {
          ...r,
          risk_flags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
          weak_comp_alerts: Array.isArray(r.weak_comp_alerts) ? r.weak_comp_alerts : [],
          adjustment_observations: Array.isArray(r.adjustment_observations) ? r.adjustment_observations : [],
          talking_points: Array.isArray(r.talking_points) ? r.talking_points : [],
          seller_objections: Array.isArray(r.seller_objections) ? r.seller_objections : [],
          extracted_comps: Array.isArray(r.extracted_comps) ? r.extracted_comps : [],
          subject_photos: Array.isArray(r.subject_photos) ? r.subject_photos : [],
          improvements_list: Array.isArray(r.improvements_list) ? r.improvements_list : [],
          cover_photo_index: r.cover_photo_index ?? 0,
          approval_status: r.approval_status || 'draft',
        };
        setReport(reportData);
        setPortalSentAt(reportData.portal_sent_at ?? null);


        if (reportData.user_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', reportData.user_id)
            .maybeSingle();
          if ((prof as any)?.full_name) setAgentName((prof as any).full_name);
        }

        const photos: string[] = reportData.subject_photos;
        if (photos.length > 0) {
          const urls: string[] = [];
          for (const path of photos) {
            const { data: signedData } = await supabase.storage
              .from('cma-documents')
              .createSignedUrl(path, 3600);
            if (signedData?.signedUrl) urls.push(signedData.signedUrl);
          }
          setPhotoUrls(urls);
        }
      }
      setLoading(false);
    };
    fetchReport();
  }, [reportId]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const isApproved = report ? ['approved', 'exported', 'pushed', 'converted'].includes(report.approval_status) : false;
  // The agent who owns the CMA, plus admins, Operations and the owner.
  const canSendToPortal = !!report && (isAdmin || (!!user && report.user_id === user.id));


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!report || report.analysis_status !== 'completed') {
    return <p className="text-muted-foreground">Report not available.</p>;
  }

  const fmt = (n: number | null | undefined) => money(n);

  // ── SINGLE SOURCE OF TRUTH for the recommended price ──
  // Computed once and referenced by every slot (summary, price card, strategy, next steps).
  const recommendedPrice = report.pricing_band_recommended;
  const recommendedPriceText = fmt(recommendedPrice);

  const compStatusLabel = (c: Comp) => {
    const label = compStatus(c);
    if (label === 'Pending') return { label, tone: 'amber' as const };
    if (label === 'Sold') return { label: 'Closed', tone: 'emerald' as const };
    return { label, tone: 'muted' as const };
  };
  const fmtDate = (d: string | null) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // Approved text with fallbacks
  const executiveSummary = cleanText(report.approved_executive_summary) ||
    `Based on an analysis of the comparable properties in this report and current conditions in ${cleanText(report.city_area)}, we recommend a listing price of ${recommendedPriceText} for ${normalizeAddress(report.property_address)}. The recommended price band ranges from ${fmt(report.pricing_band_low)} to ${fmt(report.pricing_band_high)}, with a ${cleanText(report.pricing_confidence).toLowerCase() || 'moderate'} confidence level.`;
  const marketConditionsText = cleanText(report.approved_market_conditions || report.market_narrative);
  const strategyText = cleanText(report.approved_strategy) || `Strategy: ${humanizeLabel(report.strategy_recommendation)}\n\n${report.talking_points.map((tp, i) => `${i + 1}. ${cleanText(tp)}`).join('\n')}`;
  const priceNarrativeText = cleanText(report.approved_price_narrative);

  const strongComps = report.extracted_comps.filter(c => !c.is_weak);
  const topComps = strongComps.slice(0, 6);

  // Comps summary stats
  const soldPrices = topComps.map((c) => toPositiveNumber(c.sold_price)).filter((n): n is number => n != null);
  const avgSoldPrice = soldPrices.length > 0 ? Math.round(soldPrices.reduce((s, price) => s + price, 0) / soldPrices.length) : null;
  const domValues = topComps.map((c) => toPositiveNumber(c.days_on_market)).filter((n): n is number => n != null);
  const avgDOM = domValues.length > 0 ? Math.round(domValues.reduce((s, dom) => s + dom, 0) / domValues.length) : null;
  const priceRange = soldPrices.length > 0 ? {
    low: Math.min(...soldPrices),
    high: Math.max(...soldPrices),
  } : null;

  // Market chart data
  const marketComparisonData = [
    { name: 'Active', value: report.active_listings || 0, fill: 'hsl(var(--gold))' },
    { name: 'Sold', value: report.sold_listings || 0, fill: 'hsl(var(--primary))' },
  ];

  // Equity chart data is shown only when purchase history is available.
  const purchasePrice = toPositiveNumber(report.purchase_price);
  const improvementsInvested = toPositiveNumber(report.improvements_invested) ?? 0;
  const totalCost = purchasePrice != null ? purchasePrice + improvementsInvested : null;
  const equityLow = report.equity_gain_low == null ? null : Math.round(Number(report.equity_gain_low));
  const equityHigh = report.equity_gain_high == null ? null : Math.round(Number(report.equity_gain_high));
  const equityData: Array<{ date: string; value: number; low: number; high: number }> = [];
  if (purchasePrice != null) {
    const purchaseDate = new Date(report.purchase_date);
    const validPurchaseDate = Number.isFinite(purchaseDate.getTime());
    const today = new Date();
    equityData.push({
      date: validPurchaseDate ? purchaseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Purchase',
      value: purchasePrice,
      low: purchasePrice,
      high: purchasePrice,
    });
    const yearsDiff = validPurchaseDate ? (today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0;
    if (yearsDiff > 1) {
      const mid = new Date((purchaseDate.getTime() + today.getTime()) / 2);
      const midLow = purchasePrice + ((report.pricing_band_low || purchasePrice) - purchasePrice) * 0.5;
      const midHigh = purchasePrice + ((report.pricing_band_high || purchasePrice) - purchasePrice) * 0.5;
      equityData.push({
        date: mid.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        value: (midLow + midHigh) / 2,
        low: midLow,
        high: midHigh,
      });
    }
    equityData.push({
      date: 'Today',
      value: report.pricing_band_recommended || purchasePrice,
      low: report.pricing_band_low || purchasePrice,
      high: report.pricing_band_high || purchasePrice,
    });
  }

  const cmaPdfInput: CmaPdfInput = {
    propertyAddress: report.property_address,
    cityArea: report.city_area,
    propertyType: report.property_type,
    createdAt: report.created_at,
    agentName,
    clientName: report.fub_person_name,
    executiveSummary,
    priceNarrative: priceNarrativeText,
    marketConditions: marketConditionsText,
    strategy: strategyText,
    pricingBandLow: report.pricing_band_low,
    pricingBandRecommended: report.pricing_band_recommended,
    pricingBandHigh: report.pricing_band_high,
    pricingConfidence: report.pricing_confidence,
    cmaGrade: report.cma_grade,
    bedrooms: report.bedrooms,
    bathrooms: report.bathrooms,
    aboveGradeSqFt: report.above_grade_sqft ?? null,
    finishedBasementSqFt: report.finished_basement_sqft ?? null,
    approxSqFt: report.approx_sqft,
    garage: report.garage,
    buildYear: report.build_year,
    condition: report.condition,
    keyFeatures: report.key_features || [],
    featureAdjustments: report.feature_adjustments || [],
    pricePerSqftCrossCheck: report.price_per_sqft_cross_check ?? null,
    valuationScenarios: report.valuation_scenarios ?? null,
    marketStats: {
      median_sale_price: report.median_sale_price,
      avg_days_on_market: report.avg_days_on_market,
      sale_to_list_ratio: report.sale_to_list_ratio,
      months_of_inventory: report.months_of_inventory,
      active_listings: report.active_listings,
      sold_listings: report.sold_listings,
    },
    compPriceAnomalyConfirmedAt: report.comp_price_anomaly_confirmed_at ?? null,
    comps: report.extracted_comps,
  };

  const canBuildClientPdf = (requireApproval: boolean) => {
    if (requireApproval && !isApproved) return false;
    const anomaly = detectDuplicateSoldPriceAnomaly(cmaPdfInput.comps || []);
    if (anomaly.hasAnomaly && !cmaPdfInput.compPriceAnomalyConfirmedAt) {
      toast.error('Confirm the repeated comparable sold prices before exporting this CMA.', { description: anomalyMessage(anomaly) });
      return false;
    }
    return true;
  };

  const handlePreviewPdf = async () => {
    if (!canBuildClientPdf(false)) {
      return;
    }

    setPreviewingPdf(true);
    try {
      const doc = buildCmaClientPdf(cmaPdfInput);
      const blob = doc.output('blob') as Blob;
      const nextUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextUrl;
      });
      toast.success('Client PDF preview opened');
    } catch (err) {
      console.error('CMA PDF preview failed', err);
      toast.error('Could not preview the PDF');
    } finally {
      setPreviewingPdf(false);
    }
  };

  const closePdfPreview = (open: boolean) => {
    if (!open) {
      setPdfPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });
    }
  };
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('Client PDF preview opened');
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      console.error('CMA PDF preview failed', err);
      toast.error('Could not preview the PDF');
    } finally {
      setPreviewingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!canBuildClientPdf(true)) return;

    setSavingPdf(true);
    try {
      const doc = buildCmaClientPdf(cmaPdfInput);
      doc.save(safeFileName(`Home Evaluation - ${normalizeAddress(report.property_address)}`));
      const { error } = await supabase.from('cma_reports').update({ approval_status: 'exported' } as any).eq('id', reportId);
      if (error) console.error('Failed to mark CMA exported', error);
      toast.success('Client PDF downloaded');
    } catch (err) {
      console.error('CMA PDF export failed', err);
      toast.error('Could not create the PDF');
    } finally {
      setSavingPdf(false);
    }
  };

  return (
    <div>
      {/* Print controls — hidden in print */}
      <div className="print:hidden mb-6 flex justify-end gap-3 items-center">
        {!isApproved && (
          <span className="text-xs text-amber-500 mr-2">⚠ Report not yet approved</span>
        )}
        {report.fub_person_id && isApproved && (
          <CMAFubPush
            reportId={report.id}
            fubPersonId={report.fub_person_id}
            fubPersonName={report.fub_person_name}
            propertyAddress={report.property_address}
            cmaGrade={report.cma_grade}
            pricingBandLow={report.pricing_band_low}
            pricingBandRecommended={report.pricing_band_recommended}
            pricingBandHigh={report.pricing_band_high}
            strategyRecommendation={report.strategy_recommendation}
            equityGainLow={report.equity_gain_low}
            equityGainHigh={report.equity_gain_high}
            pricingConfidence={report.pricing_confidence}
            approvedSummary={report.approved_executive_summary}
            approvalStatus={report.approval_status}
          />
        )}
        {canSendToPortal && (
          <CMASendToPortal
            reportId={report.id}
            approvalStatus={report.approval_status}
            clientName={report.fub_person_name}
            previousDocumentId={report.portal_document_id}
            previousSentAt={report.portal_sent_at}
            onSent={() => setPortalSentAt(new Date().toISOString())}
            pdfInput={cmaPdfInput}
          />
        )}
        <Button variant="outline" onClick={handlePreviewPdf} disabled={previewingPdf}>
          {previewingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
          Preview Client PDF
        </Button>
        <Button onClick={handleDownloadPdf} disabled={!isApproved || savingPdf} className="bg-gold hover:bg-gold/90 text-gold-foreground">
          {savingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Download Client PDF
        </Button>
      </div>

      {portalSentAt && (
        <p className="print:hidden -mt-4 mb-6 text-right text-xs text-muted-foreground">
          Sent to the client portal on {new Date(portalSentAt).toLocaleString()}.
        </p>
      )}


      <div className="max-w-4xl mx-auto print:max-w-none">

        {/* ═══════════════════════════════════════════
            SECTION 1 — COVER
        ═══════════════════════════════════════════ */}
        <section className="print:break-after-page mb-12">
          {/* Hero Photo */}
          {photoUrls.length > 0 && photoUrls[report.cover_photo_index] && (
            <div className="aspect-[16/9] rounded-xl overflow-hidden mb-8 shadow-lg">
              <img
                src={photoUrls[report.cover_photo_index]}
                alt={report.property_address}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="text-center space-y-3 pb-8 border-b-2 border-gold/20">
            <p className="text-xs uppercase tracking-[0.25em] text-gold font-medium">Comparative Market Analysis</p>
            <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
              {report.property_address}
            </h1>
            <p className="text-base text-muted-foreground">
              {cleanText(report.city_area)} · {humanizeLabel(report.property_type)}
              {report.bedrooms && ` · ${report.bedrooms} Bed`}
              {report.bathrooms && ` / ${report.bathrooms} Bath`}
              {report.approx_sqft && ` · ${sqftLabel(report.approx_sqft)}`}
            </p>
            <p className="text-sm text-muted-foreground/70 pt-2">
              Prepared {new Date(report.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Executive Summary */}
          <div className="mt-8 max-w-3xl mx-auto">
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line text-center">
              {executiveSummary}
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-3 gap-4 mt-10">
            <PriceCard label="Conservative" value={fmt(report.pricing_band_low)} highlighted={false} />
            <PriceCard label="Recommended" value={recommendedPriceText} highlighted />
            <PriceCard label="Aggressive" value={fmt(report.pricing_band_high)} highlighted={false} />
          </div>

          {priceNarrativeText && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-6 text-center max-w-3xl mx-auto whitespace-pre-line">
              {priceNarrativeText}
            </p>
          )}
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 2 — MARKET SNAPSHOT
        ═══════════════════════════════════════════ */}
        <section className="print:break-inside-avoid mb-12">
          <SectionHeader number={2} icon={BarChart3} title="Market Snapshot" subtitle={report.city_area} />

          {marketConditionsText && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line mb-6 max-w-3xl">
              {marketConditionsText}
            </p>
          )}

          {/* Key indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {report.median_sale_price != null && (
              <StatCard label="Median Sale Price" value={fmt(report.median_sale_price)} />
            )}
            {report.avg_days_on_market != null && (
              <StatCard label="Avg Days on Market" value={`${report.avg_days_on_market}`} />
            )}
            {report.sale_to_list_ratio != null && (
              <StatCard label="Sale-to-List Ratio" value={`${report.sale_to_list_ratio}%`} />
            )}
            {report.months_of_inventory != null && (
              <StatCard label="Months of Inventory" value={`${report.months_of_inventory}`} />
            )}
          </div>

          {/* Active vs Sold mini chart */}
          {(report.active_listings || report.sold_listings) ? (
            <Card className="border-border/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Active vs Sold Listings</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={marketComparisonData} barSize={48}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {marketComparisonData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 3 — COMPARABLE OVERVIEW
        ═══════════════════════════════════════════ */}
        {topComps.length > 0 && (
          <section className="print:break-inside-avoid mb-12">
            <SectionHeader number={3} icon={Home} title="Comparable Overview" subtitle={`${topComps.length} Key Properties`} />

            {/* Summary bar */}
            {priceRange && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatCard label="Comp Price Range" value={`${fmt(priceRange.low)} – ${fmt(priceRange.high)}`} />
                <StatCard label="Avg Sold Price" value={fmt(avgSoldPrice)} />
                <StatCard label="Avg Days on Market" value={avgDOM != null ? `${avgDOM}` : 'Not reported'} />
              </div>
            )}

            {/* Clean comp table */}
            <Card className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Address</th>
                      <th className="text-left py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Status</th>
                      <th className="text-center py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Beds / Baths</th>
                      <th className="text-right py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">List Price</th>
                      <th className="text-right py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sale Price</th>
                      <th className="text-center py-3 px-4 text-xs text-muted-foreground font-semibold uppercase tracking-wider">DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topComps.map((comp, i) => {
                      const status = compStatusLabel(comp);
                      const dateLabel = fmtDate(comp.sale_date);
                      return (
                      <tr key={i} className={`border-t border-border/40 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="py-3 px-4 font-medium text-foreground">{normalizeAddress(comp.address)}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              status.tone === 'emerald'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : status.tone === 'amber'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {status.label}
                          </span>
                          {dateLabel && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                              {status.label === 'Pending' ? `Expected close ${dateLabel}` : status.label === 'Closed' ? `Closed ${dateLabel}` : dateLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center text-muted-foreground">{cleanText(comp.beds) || 'Not reported'} / {cleanText(comp.baths) || 'Not reported'}</td>
                        <td className="py-3 px-3 text-right text-muted-foreground">{compPrice(comp, 'list')}</td>
                        <td className="py-3 px-3 text-right font-medium">{compPrice(comp, 'sold')}</td>
                        <td className="py-3 px-4 text-center text-muted-foreground">{cleanText(comp.days_on_market) || 'Not reported'}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <p className="text-[10px] text-muted-foreground/50 mt-2 italic">
              Only strong comparable properties are shown. Weak comps have been filtered for clarity.
            </p>
          </section>
        )}

        {/* ═══════════════════════════════════════════
            SECTION 4 — SUGGESTED PRICING STRATEGY
        ═══════════════════════════════════════════ */}
        <section className="print:break-inside-avoid mb-12">
          <SectionHeader number={4} icon={Target} title="Suggested Pricing Strategy" subtitle={report.strategy_recommendation || undefined} />

          <Card className="border-gold/20 bg-gold/[0.02]">
            <CardContent className="pt-6 pb-5">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {strategyText}
              </p>
            </CardContent>
          </Card>
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 5 — EQUITY POSITION
        ═══════════════════════════════════════════ */}
        <section className="print:break-inside-avoid mb-12">
          <SectionHeader number={5} icon={TrendingUp} title="Your Equity Position" />

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Purchase Price" value={fmt(purchasePrice)} />
            <StatCard label="Improvements" value={improvementsInvested > 0 ? fmt(improvementsInvested) : 'Not reported'} />
            <StatCard label="Total Invested" value={fmt(totalCost)} />
            <StatCard
              label="Current Value Range"
              value={`${fmt(report.pricing_band_low)} – ${fmt(report.pricing_band_high)}`}
              highlight
            />
          </div>

          {/* Improvements detail */}
          {report.improvements_list.length > 0 && (
            <Card className="border-border/50 mb-6">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Improvements & Upgrades</p>
                <div className="space-y-1.5">
                  {report.improvements_list.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span className="text-muted-foreground">{item.description}</span>
                      <span className="font-medium tabular-nums">${item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-1">
                    <span>Total</span>
                    <span className="text-gold tabular-nums">{fmt(improvementsInvested)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Equity growth chart */}
          {purchasePrice != null ? (
            <Card className="border-border/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Estimated Equity Growth</p>
                <p className="text-[10px] text-muted-foreground/60 italic mb-4">
                  Based on recommended price range
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                      />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Area type="monotone" dataKey="high" stroke="hsl(var(--gold))" fill="hsl(var(--gold))" fillOpacity={0.12} strokeWidth={2} name="High Estimate" />
                      <Area type="monotone" dataKey="low" stroke="hsl(var(--gold))" fill="hsl(var(--background))" fillOpacity={1} strokeWidth={1} strokeDasharray="4 4" name="Low Estimate" />
                      {totalCost != null && <ReferenceLine y={totalCost} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: 'Total Invested', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {(equityLow != null || equityHigh != null) && (
                  <div className="flex items-center justify-center gap-8 mt-4 pt-4 border-t border-border">
                    {equityLow != null && (
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Gain (Low)</p>
                        <p className={`text-lg font-bold ${equityLow >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                          {equityLow >= 0 ? '+' : ''}{fmt(equityLow)}
                        </p>
                      </div>
                    )}
                    {equityLow != null && equityHigh != null && <div className="text-2xl text-muted-foreground/30 font-light">–</div>}
                    {equityHigh != null && (
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Gain (High)</p>
                        <p className={`text-lg font-bold ${equityHigh >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                          {equityHigh >= 0 ? '+' : ''}{fmt(equityHigh)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/50 mt-3 italic text-center">
                  This is an estimate and does not constitute a formal appraisal.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-sm text-muted-foreground text-center">
                  Purchase history was not provided, so gain calculations are not shown.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 6 — NEXT STEPS
        ═══════════════════════════════════════════ */}
        <section className="print:break-inside-avoid mb-12">
          <SectionHeader number={6} icon={Phone} title="Next Steps" />

          <Card className="border-gold/30 bg-gold/[0.03]">
            <CardContent className="pt-8 pb-8">
              <div className="max-w-2xl mx-auto space-y-5">
                <NextStep step={1} text="Review this report and identify your preferred pricing strategy." />
                <NextStep step={2} text="Schedule a listing appointment to discuss timing, staging, and marketing." />
                <NextStep step={3} text={`Finalize your listing price — our recommendation is ${recommendedPriceText} — sign paperwork, and go live.`} />
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-muted-foreground mb-1">Ready to move forward?</p>
                <p className="text-base font-semibold text-gold flex items-center justify-center gap-2">
                  Let's get started <ArrowRight className="h-4 w-4" />
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Photo Gallery (bonus, if multiple photos) */}
        {photoUrls.length > 1 && (
          <section className="print:break-inside-avoid mb-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photoUrls.slice(0, 6).map((url, i) => (
                <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden border border-border">
                  <img src={url} alt={`Property photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="text-center border-t border-border pt-6 pb-4">
          <p className="text-xs text-muted-foreground">
            Prepared by {agentName || 'your agent'}, Salesperson · {tenant.brokerageName}, {tenant.brokerageDisclosure}
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">{tenant.websiteDomain}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─── Sub-components ─── */

const SectionHeader = ({
  number,
  icon: Icon,
  title,
  subtitle,
}: {
  number: number;
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) => (
  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-border/40">
    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gold/10 text-gold text-sm font-bold shrink-0">
      {number}
    </div>
    <div className="flex items-center gap-2 flex-1">
      <Icon className="h-5 w-5 text-gold" />
      <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
      {subtitle && (
        <span className="text-xs text-muted-foreground ml-1">— {subtitle}</span>
      )}
    </div>
  </div>
);

const PriceCard = ({ label, value, highlighted }: { label: string; value: string; highlighted: boolean }) => (
  <Card className={`${highlighted ? 'border-gold/40 bg-gold/5 shadow-md' : 'border-border/50'}`}>
    <CardContent className="pt-5 pb-4 text-center">
      <p className={`text-[10px] uppercase tracking-wider font-medium ${highlighted ? 'text-gold' : 'text-muted-foreground'}`}>{label}</p>
      <p className={`mt-1 font-bold ${highlighted ? 'text-2xl text-gold' : 'text-xl text-foreground'}`}>{value}</p>
    </CardContent>
  </Card>
);

const StatCard = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <Card className={`border-border/50 ${highlight ? 'bg-gold/5 border-gold/30' : ''}`}>
    <CardContent className="pt-4 pb-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
      <p className={`text-base font-bold mt-1 ${highlight ? 'text-gold' : 'text-foreground'}`}>{value}</p>
    </CardContent>
  </Card>
);

const NextStep = ({ step, text }: { step: number; text: string }) => (
  <div className="flex items-start gap-4">
    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gold text-gold-foreground text-xs font-bold shrink-0 mt-0.5">
      {step}
    </div>
    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
  </div>
);

export default CMAClientReport;