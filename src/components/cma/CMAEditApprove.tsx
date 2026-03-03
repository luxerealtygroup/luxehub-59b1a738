import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, CheckCircle, Edit3, AlertTriangle } from 'lucide-react';

interface Objection {
  objection: string;
  response: string;
}

interface CMAEditApproveProps {
  reportId: string;
  // AI-generated defaults
  marketNarrative: string | null;
  talkingPoints: string[];
  riskFlags: string[];
  sellerObjections: Objection[];
  strategyRecommendation: string | null;
  pricingBandLow: number | null;
  pricingBandRecommended: number | null;
  pricingBandHigh: number | null;
  pricingConfidence: string | null;
  propertyAddress: string;
  cityArea: string;
  // Current approved values (null = not yet edited)
  approvedExecutiveSummary: string | null;
  approvedPriceNarrative: string | null;
  approvedStrategy: string | null;
  approvedMarketConditions: string | null;
  approvedTalkingPoints: string | null;
  approvedRiskFlags: string | null;
  approvedObjections: string | null;
  approvalStatus: string;
  onUpdate: () => void;
  pricingChanged?: boolean;
}

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString()}` : 'N/A';

const CMAEditApprove = ({
  reportId,
  marketNarrative,
  talkingPoints,
  riskFlags,
  sellerObjections,
  strategyRecommendation,
  pricingBandLow,
  pricingBandRecommended,
  pricingBandHigh,
  pricingConfidence,
  propertyAddress,
  cityArea,
  approvedExecutiveSummary,
  approvedPriceNarrative,
  approvedStrategy,
  approvedMarketConditions,
  approvedTalkingPoints,
  approvedRiskFlags,
  approvedObjections,
  approvalStatus,
  onUpdate,
  pricingChanged,
}: CMAEditApproveProps) => {
  const [saving, setSaving] = useState(false);

  // Generate AI defaults
  const aiDefaults = {
    executiveSummary: `Based on a comprehensive analysis of comparable properties and current market conditions in ${cityArea}, we recommend a listing price of ${fmt(pricingBandRecommended)} for ${propertyAddress}. The recommended price band ranges from ${fmt(pricingBandLow)} to ${fmt(pricingBandHigh)}, with a ${pricingConfidence?.toLowerCase() || 'moderate'} confidence level. Our recommended strategy is ${strategyRecommendation || 'Market'}.`,
    priceNarrative: `The recommended price range of ${fmt(pricingBandLow)} to ${fmt(pricingBandHigh)} is based on recent comparable sales in ${cityArea}. The optimal listing price of ${fmt(pricingBandRecommended)} positions the property competitively while maximizing value. Pricing confidence is ${pricingConfidence || 'Moderate'}.`,
    strategy: `Strategy: ${strategyRecommendation || 'Market'}\n\n${talkingPoints.length > 0 ? talkingPoints.map((tp, i) => `${i + 1}. ${tp}`).join('\n') : 'No strategy talking points generated.'}`,
    marketConditions: marketNarrative || 'No market conditions narrative generated.',
    talkingPointsText: talkingPoints.length > 0 ? talkingPoints.map((tp, i) => `${i + 1}. ${tp}`).join('\n') : 'No talking points generated.',
    riskFlagsText: riskFlags.length > 0 ? riskFlags.map((rf, i) => `${i + 1}. ${rf}`).join('\n') : 'No risk flags identified.',
    objectionsText: sellerObjections.length > 0 ? sellerObjections.map((o, i) => `Q: ${o.objection}\nA: ${o.response}`).join('\n\n') : 'No objections generated.',
  };

  // Initialize fields with approved values or AI defaults
  const [executiveSummary, setExecutiveSummary] = useState(approvedExecutiveSummary || aiDefaults.executiveSummary);
  const [priceNarrative, setPriceNarrative] = useState(approvedPriceNarrative || aiDefaults.priceNarrative);
  const [strategy, setStrategy] = useState(approvedStrategy || aiDefaults.strategy);
  const [marketConditions, setMarketConditions] = useState(approvedMarketConditions || aiDefaults.marketConditions);
  const [talkingPointsText, setTalkingPointsText] = useState(approvedTalkingPoints || aiDefaults.talkingPointsText);
  const [riskFlagsText, setRiskFlagsText] = useState(approvedRiskFlags || aiDefaults.riskFlagsText);
  const [objectionsText, setObjectionsText] = useState(approvedObjections || aiDefaults.objectionsText);

  const handleSave = async (newStatus?: string) => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        approved_executive_summary: executiveSummary,
        approved_price_narrative: priceNarrative,
        approved_strategy: strategy,
        approved_market_conditions: marketConditions,
        approved_talking_points: talkingPointsText,
        approved_risk_flags: riskFlagsText,
        approved_objections: objectionsText,
      };
      if (newStatus) updateData.approval_status = newStatus;

      const { error } = await supabase
        .from('cma_reports')
        .update(updateData as any)
        .eq('id', reportId);

      if (error) throw error;
      toast.success(newStatus === 'approved' ? 'Report approved!' : 'Edits saved');
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    reviewed: 'bg-blue-500/20 text-blue-500',
    approved: 'bg-emerald-500/20 text-emerald-500',
    exported: 'bg-gold/20 text-gold',
    pushed: 'bg-primary/20 text-primary',
  };

  const sections: Array<{
    label: string;
    value: string;
    setter: (v: string) => void;
    aiDefault: string;
    clientFacing: boolean;
    rows?: number;
  }> = [
    { label: 'Executive Summary', value: executiveSummary, setter: setExecutiveSummary, aiDefault: aiDefaults.executiveSummary, clientFacing: true, rows: 4 },
    { label: 'Recommended Price Range', value: priceNarrative, setter: setPriceNarrative, aiDefault: aiDefaults.priceNarrative, clientFacing: true, rows: 3 },
    { label: 'Strategy Recommendations', value: strategy, setter: setStrategy, aiDefault: aiDefaults.strategy, clientFacing: true, rows: 5 },
    { label: 'Market Conditions', value: marketConditions, setter: setMarketConditions, aiDefault: aiDefaults.marketConditions, clientFacing: true, rows: 4 },
    { label: 'Internal Talking Points', value: talkingPointsText, setter: setTalkingPointsText, aiDefault: aiDefaults.talkingPointsText, clientFacing: false, rows: 5 },
    { label: 'Risks / Red Flags', value: riskFlagsText, setter: setRiskFlagsText, aiDefault: aiDefaults.riskFlagsText, clientFacing: false, rows: 4 },
    { label: 'Objections + Responses', value: objectionsText, setter: setObjectionsText, aiDefault: aiDefaults.objectionsText, clientFacing: false, rows: 6 },
  ];

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <Card className="border-gold/20">
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Approval Status:</span>
              <div className="flex gap-1">
                {['draft', 'reviewed', 'approved', 'exported', 'pushed'].map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className={`text-[10px] ${approvalStatus === s ? statusColors[s] + ' font-bold' : 'text-muted-foreground/40 border-muted/20'}`}
                  >
                    {s === 'draft' ? 'Draft' : s === 'reviewed' ? 'Reviewed' : s === 'approved' ? 'Approved' : s === 'exported' ? 'PDF Exported' : 'Pushed to FUB'}
                  </Badge>
                ))}
              </div>
            </div>
            {pricingChanged && (
              <div className="flex items-center gap-1 text-amber-500 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                Pricing band changed — review your wording before exporting.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Editable Sections */}
      {sections.map((section) => (
        <Card key={section.label} className="border-gold/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Edit3 className="h-3.5 w-3.5 text-gold" />
                {section.label}
                <Badge variant="outline" className={`text-[9px] ${section.clientFacing ? 'border-gold/40 text-gold' : 'border-muted text-muted-foreground'}`}>
                  {section.clientFacing ? 'Client-Facing' : 'Internal'}
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => section.setter(section.aiDefault)}
                disabled={section.value === section.aiDefault}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Reset to AI Draft
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={section.value}
              onChange={(e) => section.setter(e.target.value)}
              rows={section.rows || 4}
              className="text-sm"
            />
          </CardContent>
        </Card>
      ))}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={() => handleSave('reviewed')}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Save as Reviewed
        </Button>
        <Button
          onClick={() => handleSave('approved')}
          disabled={saving}
          className="bg-gold hover:bg-gold/90 text-gold-foreground"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
          Approve Report
        </Button>
      </div>
    </div>
  );
};

export default CMAEditApprove;
