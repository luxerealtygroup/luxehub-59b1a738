import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, TrendingUp, Shield, MessageSquare, Target } from 'lucide-react';
import CMAFubPush from './CMAFubPush';

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
  fub_person_id: number | null;
  fub_person_name: string | null;
}

const CMAAuditView = ({ reportId }: { reportId: string }) => {
  const [report, setReport] = useState<CMAReportFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('cma_reports')
        .select('*')
        .eq('id', reportId)
        .single();
      if (error) {
        toast.error('Failed to load report');
        console.error(error);
      } else {
        // Cast JSONB arrays
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
    fetch();
  }, [reportId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!report) return <p className="text-muted-foreground">Report not found.</p>;

  if (report.analysis_status === 'draft') {
    return (
      <Card className="border-gold/20">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">This report is a draft. Run analysis to see results.</p>
        </CardContent>
      </Card>
    );
  }

  if (report.analysis_status === 'processing') {
    return (
      <Card className="border-gold/20">
        <CardContent className="py-12 text-center flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <p className="text-muted-foreground">Analysis in progress...</p>
        </CardContent>
      </Card>
    );
  }

  if (report.analysis_status === 'error') {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <p className="text-destructive">Analysis encountered an error. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  const fmt = (n: number | null) => n != null ? `$${n.toLocaleString()}` : '—';
  const gradeColors: Record<string, string> = {
    A: 'text-emerald-500 border-emerald-500', B: 'text-green-500 border-green-500',
    C: 'text-amber-500 border-amber-500', D: 'text-orange-500 border-orange-500',
    F: 'text-destructive border-destructive',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* FUB Push */}
      {report.fub_person_id && (
        <div className="flex justify-end">
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
          />
        </div>
      )}

      {/* Header Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Grade */}
        <Card className="border-gold/20">
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CMA Quality</p>
            <span className={`text-5xl font-bold ${gradeColors[report.cma_grade || ''] || 'text-muted-foreground'}`}>
              {report.cma_grade || '?'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">Confidence: {report.pricing_confidence || '—'}</p>
          </CardContent>
        </Card>

        {/* Pricing Band */}
        <Card className="border-gold/20 sm:col-span-2">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Recommended Price Band</p>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground">Low</p>
                <p className="text-lg font-medium">{fmt(report.pricing_band_low)}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[10px] text-gold">Recommended</p>
                <p className="text-2xl font-bold text-gold">{fmt(report.pricing_band_recommended)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">High</p>
                <p className="text-lg font-medium">{fmt(report.pricing_band_high)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Strategy */}
        <Card className="border-gold/20">
          <CardContent className="pt-6 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Strategy</p>
            <p className="text-xl font-bold text-gold">{report.strategy_recommendation || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Gain */}
      <Card className="border-gold/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gold" /> Estimated Equity Gain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Purchase Price</p>
              <p className="font-medium">{fmt(report.purchase_price)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Improvements</p>
              <p className="font-medium">{fmt(report.improvements_invested)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. Gain (Low)</p>
              <p className={`font-bold ${(report.equity_gain_low || 0) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                {fmt(report.equity_gain_low)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. Gain (High)</p>
              <p className={`font-bold ${(report.equity_gain_high || 0) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                {fmt(report.equity_gain_high)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Flags */}
      {report.risk_flags.length > 0 && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Risk Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {report.risk_flags.map((flag, i) => (
                <li key={i} className="text-sm text-destructive/80 flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                  {flag}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Weak Comp Alerts */}
      {report.weak_comp_alerts.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-500">
              <Shield className="h-4 w-4" /> Weak Comp Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {report.weak_comp_alerts.map((alert, i) => (
                <li key={i} className="text-sm text-amber-500/80 flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  {alert}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Extracted Comps Table */}
      {report.extracted_comps.length > 0 && (
        <Card className="border-gold/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Extracted Comparables ({report.extracted_comps.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Address</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Beds</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Baths</th>
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">List</th>
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Sold</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">DOM</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {report.extracted_comps.map((comp, i) => (
                  <tr key={i} className={`border-b border-border/50 ${comp.is_weak ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-2 px-2 font-medium">{comp.address}</td>
                    <td className="py-2 px-2 text-center">{comp.beds ?? '—'}</td>
                    <td className="py-2 px-2 text-center">{comp.baths ?? '—'}</td>
                    <td className="py-2 px-2 text-right">{comp.list_price ? `$${comp.list_price.toLocaleString()}` : '—'}</td>
                    <td className="py-2 px-2 text-right">{comp.sold_price ? `$${comp.sold_price.toLocaleString()}` : '—'}</td>
                    <td className="py-2 px-2 text-center">{comp.days_on_market ?? '—'}</td>
                    <td className="py-2 px-2 text-center">
                      {comp.is_weak ? (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">Weak</Badge>
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Adjustment Observations */}
      {report.adjustment_observations.length > 0 && (
        <Card className="border-gold/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adjustment Observations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {report.adjustment_observations.map((obs, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                  {obs}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Market Narrative */}
      {report.market_narrative && (
        <Card className="border-gold/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Market Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{report.market_narrative}</p>
          </CardContent>
        </Card>
      )}

      {/* Talking Points */}
      {report.talking_points.length > 0 && (
        <Card className="border-gold/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-gold" /> Suggested Talking Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.talking_points.map((tp, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                  {tp}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Seller Objections */}
      {report.seller_objections.length > 0 && (
        <Card className="border-gold/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gold" /> Likely Seller Objections & Responses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.seller_objections.map((obj, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium text-foreground">"{obj.objection}"</p>
                <p className="text-sm text-muted-foreground pl-4 border-l-2 border-gold/30">{obj.response}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CMAAuditView;
