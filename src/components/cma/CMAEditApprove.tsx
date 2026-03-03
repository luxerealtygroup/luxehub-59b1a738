import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, CheckCircle, Edit3, AlertTriangle, XCircle } from 'lucide-react';

interface Objection {
  objection: string;
  response: string;
}

interface CMAEditApproveProps {
  reportId: string;
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
  // Validation data
  soldCompsCount: number;
  purchasePrice: number | null;
  purchaseDate: string | null;
  improvementsTotal: number;
  equityGainLow: number | null;
  equityGainHigh: number | null;
  compsOverrideReason?: string;
  onCompsOverrideReasonChange?: (reason: string) => void;
}

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString()}` : 'N/A';

export const STATUS_FLOW = [
  { key: 'draft', label: 'Draft' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'approved', label: 'Approved' },
  { key: 'exported', label: 'Exported' },
  { key: 'pushed', label: 'Pushed to FUB' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
] as const;

const TERMINAL_STATUSES = ['converted', 'lost'];
const POST_APPROVAL_STATUSES = ['approved', 'exported', 'pushed'];

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

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
  soldCompsCount,
  purchasePrice,
  purchaseDate,
  improvementsTotal,
  equityGainLow,
  equityGainHigh,
  compsOverrideReason,
  onCompsOverrideReasonChange,
}: CMAEditApproveProps) => {
  const [saving, setSaving] = useState(false);
  const isTerminal = TERMINAL_STATUSES.includes(approvalStatus);
  const isPostApproval = POST_APPROVAL_STATUSES.includes(approvalStatus);

  // --- Validation ---
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];

    if (soldCompsCount < 3 && !(compsOverrideReason && compsOverrideReason.trim().length > 0)) {
      issues.push({ type: 'error', message: `Only ${soldCompsCount} sold comp${soldCompsCount !== 1 ? 's' : ''} found — at least 3 required, or provide an override reason below.` });
    }

    if (!purchasePrice || purchasePrice <= 0) {
      issues.push({ type: 'error', message: 'Purchase price is required for equity calculations.' });
    }
    if (!purchaseDate) {
      issues.push({ type: 'error', message: 'Purchase date is required for equity calculations.' });
    }

    if (equityGainLow != null && equityGainLow < 0) {
      issues.push({ type: 'warning', message: `Estimated equity gain (low) is negative: ${fmt(equityGainLow)}. Verify pricing and improvements.` });
    }

    if (improvementsTotal > 0 && (!purchasePrice || purchasePrice <= 0)) {
      issues.push({ type: 'warning', message: `Improvements total (${fmt(improvementsTotal)}) entered but purchase price is missing — equity calculation will be inaccurate.` });
    }

    return issues;
  }, [soldCompsCount, compsOverrideReason, purchasePrice, purchaseDate, equityGainLow, improvementsTotal]);

  const hasBlockingErrors = validationIssues.some(i => i.type === 'error');

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

  const [executiveSummary, setExecutiveSummary] = useState(approvedExecutiveSummary || aiDefaults.executiveSummary);
  const [priceNarrative, setPriceNarrative] = useState(approvedPriceNarrative || aiDefaults.priceNarrative);
  const [strategy, setStrategy] = useState(approvedStrategy || aiDefaults.strategy);
  const [marketConditions, setMarketConditions] = useState(approvedMarketConditions || aiDefaults.marketConditions);
  const [talkingPointsText, setTalkingPointsText] = useState(approvedTalkingPoints || aiDefaults.talkingPointsText);
  const [riskFlagsText, setRiskFlagsText] = useState(approvedRiskFlags || aiDefaults.riskFlagsText);
  const [objectionsText, setObjectionsText] = useState(approvedObjections || aiDefaults.objectionsText);

  const handleSave = async (newStatus?: string) => {
    if (newStatus === 'approved' && hasBlockingErrors) {
      toast.error('Cannot approve — fix validation errors first.');
      return;
    }
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
    reviewing: 'bg-blue-500/20 text-blue-500',
    approved: 'bg-emerald-500/20 text-emerald-500',
    exported: 'bg-gold/20 text-gold',
    pushed: 'bg-primary/20 text-primary',
    converted: 'bg-green-600/20 text-green-600',
    lost: 'bg-destructive/20 text-destructive',
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
              <div className="flex gap-1 flex-wrap">
                {STATUS_FLOW.map((s) => (
                  <Badge
                    key={s.key}
                    variant="outline"
                    className={`text-[10px] ${approvalStatus === s.key ? statusColors[s.key] + ' font-bold' : 'text-muted-foreground/40 border-muted/20'}`}
                  >
                    {s.label}
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

      {/* Validation Issues */}
      {validationIssues.length > 0 && (
        <Card className={`${hasBlockingErrors ? 'border-destructive/30' : 'border-amber-500/30'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {hasBlockingErrors ? (
                <><XCircle className="h-4 w-4 text-destructive" /> Validation Issues</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-500" /> Warnings</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {validationIssues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm ${issue.type === 'error' ? 'text-destructive' : 'text-amber-600'}`}>
                {issue.type === 'error' ? <XCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{issue.message}</span>
              </div>
            ))}

            {soldCompsCount < 3 && onCompsOverrideReasonChange && (
              <div className="pt-2 border-t border-border">
                <label className="text-xs text-muted-foreground block mb-1">
                  Override: Explain why fewer than 3 sold comps is acceptable
                </label>
                <Textarea
                  value={compsOverrideReason || ''}
                  onChange={(e) => onCompsOverrideReasonChange(e.target.value)}
                  rows={2}
                  placeholder="e.g., Limited comparable sales in this micro-market; used active listings to supplement..."
                  className="text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
      <div className="flex gap-3 justify-end flex-wrap items-center">
        {hasBlockingErrors && !isTerminal && (
          <span className="text-xs text-destructive mr-auto">Fix errors above before approving</span>
        )}
        {!isTerminal && (
          <>
            <Button
              variant="outline"
              onClick={() => handleSave('reviewing')}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save as Reviewing
            </Button>
            <Button
              onClick={() => handleSave('approved')}
              disabled={saving || hasBlockingErrors}
              className="bg-gold hover:bg-gold/90 text-gold-foreground"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Approve Report
            </Button>
          </>
        )}
        {isPostApproval && !isTerminal && (
          <>
            <Button
              variant="outline"
              onClick={() => handleSave('converted')}
              disabled={saving}
              className="border-green-600/30 text-green-600 hover:bg-green-600/10"
            >
              Converted to Listing
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave('lost')}
              disabled={saving}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Mark as Lost
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default CMAEditApprove;