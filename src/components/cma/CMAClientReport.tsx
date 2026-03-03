import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Printer, TrendingUp, BarChart3, Home, Target, FileText, ArrowRight, Phone } from 'lucide-react';
import CMAFubPush from './CMAFubPush';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, ReferenceLine,
} from 'recharts';

interface Comp {
  address: string;
  area: string;
  beds: number | null;
  baths: number | null;
  list_price: number | null;
  sold_price: number | null;
  days_on_market: number | null;
  sale_date: string | null;
  is_weak: boolean;
  weak_reason: string | null;
}

interface CMAReportFull {
  id: string;
  property_address: string;
  city_area: string;
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  approx_sqft: number | null;
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
}

const CMAClientReport = ({ reportId }: { reportId: string }) => {
  const [report, setReport] = useState<CMAReportFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

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

  const handlePrint = () => {
    supabase.from('cma_reports').update({ approval_status: 'exported' } as any).eq('id', reportId);
    window.print();
  };

  const isApproved = report ? ['approved', 'exported', 'pushed', 'converted'].includes(report.approval_status) : false;

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

  const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString()}` : '—';

  // Approved text with fallbacks
  const executiveSummary = report.approved_executive_summary ||
    `Based on a comprehensive analysis of comparable properties and current market conditions in ${report.city_area}, we recommend a listing price of ${fmt(report.pricing_band_recommended)} for ${report.property_address}. The recommended price band ranges from ${fmt(report.pricing_band_low)} to ${fmt(report.pricing_band_high)}, with a ${report.pricing_confidence?.toLowerCase() || 'moderate'} confidence level.`;
  const marketConditionsText = report.approved_market_conditions || report.market_narrative;
  const strategyText = report.approved_strategy || `Strategy: ${report.strategy_recommendation}\n\n${report.talking_points.map((tp, i) => `${i + 1}. ${tp}`).join('\n')}`;
  const priceNarrativeText = report.approved_price_narrative;

  const strongComps = report.extracted_comps.filter(c => !c.is_weak);
  const topComps = strongComps.slice(0, 6);

  // Comps summary stats
  const soldComps = topComps.filter(c => c.sold_price != null && c.sold_price > 0);
  const avgSoldPrice = soldComps.length > 0 ? Math.round(soldComps.reduce((s, c) => s + (c.sold_price || 0), 0) / soldComps.length) : null;
  const avgDOM = soldComps.length > 0 ? Math.round(soldComps.reduce((s, c) => s + (c.days_on_market || 0), 0) / soldComps.length) : null;
  const priceRange = soldComps.length > 0 ? {
    low: Math.min(...soldComps.map(c => c.sold_price!)),
    high: Math.max(...soldComps.map(c => c.sold_price!)),
  } : null;

  // Market chart data
  const marketComparisonData = [
    { name: 'Active', value: report.active_listings || 0, fill: 'hsl(var(--gold))' },
    { name: 'Sold', value: report.sold_listings || 0, fill: 'hsl(var(--primary))' },
  ];

  // Equity chart data
  const purchaseDate = new Date(report.purchase_date);
  const today = new Date();
  const equityData = [
    {
      date: purchaseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      value: report.purchase_price,
      low: report.purchase_price,
      high: report.purchase_price,
    },
  ];
  const yearsDiff = (today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (yearsDiff > 1) {
    const mid = new Date((purchaseDate.getTime() + today.getTime()) / 2);
    const midLow = report.purchase_price + ((report.pricing_band_low || report.purchase_price) - report.purchase_price) * 0.5;
    const midHigh = report.purchase_price + ((report.pricing_band_high || report.purchase_price) - report.purchase_price) * 0.5;
    equityData.push({
      date: mid.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      value: (midLow + midHigh) / 2,
      low: midLow,
      high: midHigh,
    });
  }
  equityData.push({
    date: 'Today',
    value: report.pricing_band_recommended || report.purchase_price,
    low: report.pricing_band_low || report.purchase_price,
    high: report.pricing_band_high || report.purchase_price,
  });

  const equityLow = report.equity_gain_low ?? 0;
  const equityHigh = report.equity_gain_high ?? 0;
  const totalCost = report.purchase_price + (report.improvements_invested || 0);

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
        <Button onClick={handlePrint} disabled={!isApproved} className="bg-gold hover:bg-gold/90 text-gold-foreground">
          <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
        </Button>
      </div>

      <div ref={printRef} className="max-w-4xl mx-auto print:max-w-none">

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
              {report.city_area} · {report.property_type}
              {report.bedrooms && ` · ${report.bedrooms} Bed`}
              {report.bathrooms && ` / ${report.bathrooms} Bath`}
              {report.approx_sqft && ` · ${report.approx_sqft.toLocaleString()} sqft`}
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
            <PriceCard label="Recommended" value={fmt(report.pricing_band_recommended)} highlighted />
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
                <StatCard label="Avg Days on Market" value={avgDOM != null ? `${avgDOM}` : '—'} />
              </div>
            )}

            {/* Clean comp table */}
            <Card className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Address</th>
                      <th className="text-center py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Beds / Baths</th>
                      <th className="text-right py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">List Price</th>
                      <th className="text-right py-3 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sold Price</th>
                      <th className="text-center py-3 px-4 text-xs text-muted-foreground font-semibold uppercase tracking-wider">DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topComps.map((comp, i) => (
                      <tr key={i} className={`border-t border-border/40 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="py-3 px-4 font-medium text-foreground">{comp.address}</td>
                        <td className="py-3 px-3 text-center text-muted-foreground">{comp.beds ?? '—'} / {comp.baths ?? '—'}</td>
                        <td className="py-3 px-3 text-right text-muted-foreground">{comp.list_price ? `$${comp.list_price.toLocaleString()}` : '—'}</td>
                        <td className="py-3 px-3 text-right font-medium">{comp.sold_price ? `$${comp.sold_price.toLocaleString()}` : '—'}</td>
                        <td className="py-3 px-4 text-center text-muted-foreground">{comp.days_on_market ?? '—'}</td>
                      </tr>
                    ))}
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
            <StatCard label="Purchase Price" value={fmt(report.purchase_price)} />
            <StatCard label="Improvements" value={fmt(report.improvements_invested)} />
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
                    <span className="text-gold tabular-nums">${report.improvements_invested.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Equity growth chart */}
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
                    <ReferenceLine y={totalCost} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: 'Total Invested', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Gain summary */}
              <div className="flex items-center justify-center gap-8 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Gain (Low)</p>
                  <p className={`text-lg font-bold ${equityLow >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {equityLow >= 0 ? '+' : ''}{fmt(equityLow)}
                  </p>
                </div>
                <div className="text-2xl text-muted-foreground/30 font-light">–</div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Gain (High)</p>
                  <p className={`text-lg font-bold ${equityHigh >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {equityHigh >= 0 ? '+' : ''}{fmt(equityHigh)}
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/50 mt-3 italic text-center">
                This is an estimate and does not constitute a formal appraisal.
              </p>
            </CardContent>
          </Card>
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
                <NextStep step={3} text="Finalize your listing price, sign paperwork, and go live!" />
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
          <p className="text-xs text-muted-foreground">Prepared by RealtyHub · CMA Boss</p>
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