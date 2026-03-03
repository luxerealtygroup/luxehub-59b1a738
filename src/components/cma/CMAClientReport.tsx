import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Printer, TrendingUp, BarChart3, Home, Target, FileText } from 'lucide-react';
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

interface Objection {
  objection: string;
  response: string;
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
  seller_objections: Objection[];
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
}

const CMAClientReport = ({ reportId }: { reportId: string }) => {
  const [report, setReport] = useState<CMAReportFull | null>(null);
  const [loading, setLoading] = useState(true);
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
        setReport({
          ...r,
          risk_flags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
          weak_comp_alerts: Array.isArray(r.weak_comp_alerts) ? r.weak_comp_alerts : [],
          adjustment_observations: Array.isArray(r.adjustment_observations) ? r.adjustment_observations : [],
          talking_points: Array.isArray(r.talking_points) ? r.talking_points : [],
          seller_objections: Array.isArray(r.seller_objections) ? r.seller_objections : [],
          extracted_comps: Array.isArray(r.extracted_comps) ? r.extracted_comps : [],
        });
      }
      setLoading(false);
    };
    fetchReport();
  }, [reportId]);

  const handlePrint = () => {
    window.print();
  };

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

  // Market Stats Chart Data
  const marketComparisonData = [
    { name: 'Active', value: report.active_listings || 0, fill: 'hsl(var(--gold))' },
    { name: 'Sold', value: report.sold_listings || 0, fill: 'hsl(var(--primary))' },
  ];

  // Equity Over Time Data
  const purchaseDate = new Date(report.purchase_date);
  const today = new Date();
  const totalCost = report.purchase_price + (report.improvements_invested || 0);

  const equityData = [
    {
      date: purchaseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      value: report.purchase_price,
      low: report.purchase_price,
      high: report.purchase_price,
    },
  ];

  // Add midpoint if purchase was more than 1 year ago
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

  // Strong comps only for client report
  const strongComps = report.extracted_comps.filter(c => !c.is_weak);

  return (
    <div>
      {/* Print Button - hidden in print */}
      <div className="print:hidden mb-6 flex justify-end">
        <Button onClick={handlePrint} className="bg-gold hover:bg-gold/90 text-gold-foreground">
          <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
        </Button>
      </div>

      <div ref={printRef} className="space-y-8 max-w-4xl mx-auto print:max-w-none">
        {/* Report Header */}
        <div className="text-center border-b-2 border-gold/30 pb-6">
          <h1 className="text-3xl font-display font-bold text-foreground">Comparative Market Analysis</h1>
          <p className="text-lg text-gold mt-1">{report.property_address}</p>
          <p className="text-sm text-muted-foreground">{report.city_area} · {report.property_type}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Prepared {new Date(report.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Executive Summary */}
        <section className="print:break-inside-avoid">
          <SectionTitle icon={FileText} title="Executive Summary" />
          <Card className="border-gold/20">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Based on a comprehensive analysis of comparable properties and current market conditions in {report.city_area}, 
                we recommend a listing price of <span className="font-bold text-gold">{fmt(report.pricing_band_recommended)}</span> for {report.property_address}. 
                The recommended price band ranges from {fmt(report.pricing_band_low)} to {fmt(report.pricing_band_high)}, 
                with a <span className="font-medium">{report.pricing_confidence?.toLowerCase()}</span> confidence level. 
                Our recommended strategy is <span className="font-medium text-gold">{report.strategy_recommendation}</span>.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Recommended Price Range */}
        <section className="print:break-inside-avoid">
          <SectionTitle icon={Target} title="Recommended Price Range" />
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-gold/20">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Conservative</p>
                <p className="text-xl font-bold mt-1">{fmt(report.pricing_band_low)}</p>
              </CardContent>
            </Card>
            <Card className="border-gold/40 bg-gold/5">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-gold uppercase tracking-wider font-medium">Recommended</p>
                <p className="text-2xl font-bold text-gold mt-1">{fmt(report.pricing_band_recommended)}</p>
              </CardContent>
            </Card>
            <Card className="border-gold/20">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Aggressive</p>
                <p className="text-xl font-bold mt-1">{fmt(report.pricing_band_high)}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Market Conditions Overview */}
        <section className="print:break-inside-avoid">
          <SectionTitle icon={BarChart3} title="Market Conditions Overview" />
          {report.market_narrative && (
            <Card className="border-gold/20 mb-4">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground leading-relaxed">{report.market_narrative}</p>
              </CardContent>
            </Card>
          )}

          {/* Market Stats Indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {report.median_sale_price != null && (
              <StatIndicator label="Median Sale Price" value={fmt(report.median_sale_price)} />
            )}
            {report.avg_days_on_market != null && (
              <StatIndicator label="Avg Days on Market" value={`${report.avg_days_on_market}`} />
            )}
            {report.sale_to_list_ratio != null && (
              <StatIndicator label="Sale-to-List Ratio" value={`${report.sale_to_list_ratio}%`} />
            )}
            {report.months_of_inventory != null && (
              <StatIndicator label="Months of Inventory" value={`${report.months_of_inventory}`} />
            )}
          </div>

          {/* Active vs Sold Chart */}
          {(report.active_listings || report.sold_listings) ? (
            <Card className="border-gold/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Active vs Sold Listings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={marketComparisonData} barSize={60}>
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

        {/* Key Comparable Properties */}
        {strongComps.length > 0 && (
          <section className="print:break-inside-avoid">
            <SectionTitle icon={Home} title="Key Comparable Properties" />
            <Card className="border-gold/20">
              <CardContent className="pt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Address</th>
                      <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Beds/Baths</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">List Price</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Sold Price</th>
                      <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strongComps.slice(0, 8).map((comp, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-2 font-medium">{comp.address}</td>
                        <td className="py-2 px-2 text-center">{comp.beds ?? '—'}/{comp.baths ?? '—'}</td>
                        <td className="py-2 px-2 text-right">{comp.list_price ? `$${comp.list_price.toLocaleString()}` : '—'}</td>
                        <td className="py-2 px-2 text-right">{comp.sold_price ? `$${comp.sold_price.toLocaleString()}` : '—'}</td>
                        <td className="py-2 px-2 text-center">{comp.days_on_market ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Strategy Recommendation */}
        <section className="print:break-inside-avoid">
          <SectionTitle icon={Target} title="Strategy Recommendation" />
          <Card className="border-gold/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg font-bold text-gold">{report.strategy_recommendation}</span>
                <span className="text-xs text-muted-foreground">Pricing Strategy</span>
              </div>
              {report.talking_points.length > 0 && (
                <ul className="space-y-2">
                  {report.talking_points.slice(0, 4).map((tp, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                      {tp}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Your Equity Journey */}
        <section className="print:break-inside-avoid">
          <SectionTitle icon={TrendingUp} title="Your Equity Journey" />
          <Card className="border-gold/20">
            <CardHeader className="pb-1">
              <p className="text-xs text-muted-foreground italic">
                Estimated Equity Growth Based on Recommended Price Range
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-64 mb-4">
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
                    <Area
                      type="monotone"
                      dataKey="high"
                      stroke="hsl(var(--gold))"
                      fill="hsl(var(--gold))"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      name="High Estimate"
                    />
                    <Area
                      type="monotone"
                      dataKey="low"
                      stroke="hsl(var(--gold))"
                      fill="hsl(var(--background))"
                      fillOpacity={1}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      name="Low Estimate"
                    />
                    <ReferenceLine
                      y={report.purchase_price}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                      label={{ value: 'Purchase Price', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Equity Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Purchase Price</p>
                  <p className="font-medium">{fmt(report.purchase_price)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Purchase Date</p>
                  <p className="font-medium">{new Date(report.purchase_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Improvements</p>
                  <p className="font-medium">{fmt(report.improvements_invested)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Est. Gain Range</p>
                  <p className="font-bold text-gold">
                    {fmt(report.equity_gain_low)} – {fmt(report.equity_gain_high)}
                  </p>
                </div>
              </div>

              {/* Disclaimer */}
              <p className="text-[10px] text-muted-foreground/60 mt-4 italic">
                This is an estimate based on the recommended price range and does not constitute a formal appraisal.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <div className="text-center border-t border-gold/20 pt-6 text-xs text-muted-foreground">
          <p>Prepared by RealtyHub · CMA Boss AI Analysis</p>
          <p className="mt-1">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
};

// Reusable section title
const SectionTitle = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon className="h-5 w-5 text-gold" />
    <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
  </div>
);

// Stat indicator card
const StatIndicator = ({ label, value }: { label: string; value: string }) => (
  <Card className="border-gold/20">
    <CardContent className="pt-4 pb-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-foreground mt-1">{value}</p>
    </CardContent>
  </Card>
);

export default CMAClientReport;
