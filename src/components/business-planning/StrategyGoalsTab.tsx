import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Target, Brain, Zap, Save, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { ActiveMetrics, GoalInputs, AISuggestion, AIInsight, currentYear } from './types';
import { StatCard, BreakdownRow } from './shared';

interface Props {
  metrics: ActiveMetrics | null;
  mode: 'active' | 'planning';
  goals: GoalInputs;
  setGoals: React.Dispatch<React.SetStateAction<GoalInputs>>;
  goalsId: string | null;
  setGoalsId: (id: string | null) => void;
  quarter: number;
  uid: string | null;
  isViewingAsAgent: boolean;
  effectiveRates: { contactToAppt: number; apptToContract: number; cmaToListing: number; dialsToAppt: number };
}

export function StrategyGoalsTab({
  metrics, mode, goals, setGoals, goalsId, setGoalsId,
  quarter, uid, isViewingAsAgent, effectiveRates,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  const netPerDeal = goals.avg_commission * (goals.split_percent / 100);
  const requiredClosings = netPerDeal > 0 ? Math.ceil(goals.gci_target / netPerDeal) : 0;
  const requiredListings = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredCMAs = effectiveRates.cmaToListing > 0 ? Math.ceil(requiredListings / (effectiveRates.cmaToListing / 100)) : 0;
  const requiredAppts = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredContacts = effectiveRates.contactToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.contactToAppt / 100)) : 0;
  const requiredDials = effectiveRates.dialsToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.dialsToAppt / 100)) : 0;

  const monthsInQ = 3;
  const weeksInQ = 13;
  const daysInQ = 65;
  const monthly = (v: number) => Math.ceil(v / monthsInQ);
  const weekly = (v: number) => Math.ceil(v / weeksInQ);
  const daily = (v: number) => Math.ceil(v / daysInQ);

  const pipelineGap = metrics ? requiredClosings - (metrics.pendingDeals + Math.round(metrics.activeListings * 0.5)) : 0;

  const saveGoals = async () => {
    if (!uid || isViewingAsAgent) return;
    setSaving(true);
    const payload = { ...goals, user_id: uid, year: currentYear, quarter };
    if (goalsId) {
      await supabase.from('planning_assumptions').update(payload).eq('id', goalsId);
    } else {
      const { data } = await supabase.from('planning_assumptions').insert(payload).select('id').single();
      if (data) setGoalsId(data.id);
    }
    toast({ title: 'Goals saved' });
    setSaving(false);
  };

  const generateAISuggestions = async () => {
    if (!metrics) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('business-planning-ai', {
        body: {
          metrics: {
            ytdClosedDeals: metrics.ytdClosedDeals, ytdGCI: metrics.ytdGCI,
            pendingGCI: metrics.pendingGCI, avgCommission: metrics.avgCommission,
            cmaToListingPct: metrics.cmaToListingPct, apptToContractPct: metrics.apptToContractPct,
            contactToApptPct: metrics.contactToApptPct, dialsToApptPct: metrics.dialsToApptPct,
            weeklyAvgDials: metrics.weeklyAvgDials, weeklyAvgContacts: metrics.weeklyAvgContacts,
            weeklyAvgAppts: metrics.weeklyAvgAppts, weeklyAvgCMAs: metrics.weeklyAvgCMAs,
            pendingDeals: metrics.pendingDeals, activeListings: metrics.activeListings,
            targetGCI: metrics.targetGCI, projectedYearEndGCI: metrics.projectedYearEndGCI,
          },
          quarter,
        },
      });
      if (error) throw error;
      if (data?.suggestions) setAiSuggestions(data.suggestions);
      if (data?.insights) setAiInsights(data.insights);
    } catch {
      toast({ title: 'Could not generate AI suggestions', variant: 'destructive' });
      generateLocalSuggestions();
    }
    setAiLoading(false);
  };

  const generateLocalSuggestions = () => {
    if (!metrics) return;
    const m = metrics;
    const avgC = m.avgCommission || 15000;
    const wks = 13;
    const buildSuggestion = (label: string, closings: number): AISuggestion => {
      const appts = effectiveRates.apptToContract > 0 ? Math.ceil(closings / (effectiveRates.apptToContract / 100)) : closings * 4;
      const contacts = effectiveRates.contactToAppt > 0 ? Math.ceil(appts / (effectiveRates.contactToAppt / 100)) : appts * 5;
      const dials = effectiveRates.dialsToAppt > 0 ? Math.ceil(appts / (effectiveRates.dialsToAppt / 100)) : appts * 10;
      const cmas = effectiveRates.cmaToListing > 0 ? Math.ceil(closings / (effectiveRates.cmaToListing / 100)) : closings * 3;
      return { label, closings, gci: closings * avgC, weeklyDials: Math.ceil(dials / wks), weeklyContacts: Math.ceil(contacts / wks), weeklyAppts: Math.ceil(appts / wks), weeklyCMAs: Math.ceil(cmas / wks) };
    };
    setAiSuggestions([
      buildSuggestion('Conservative', Math.max(Math.round(m.ytdClosedDeals * 0.25), 2)),
      buildSuggestion('Realistic', Math.max(Math.round(m.ytdClosedDeals * 0.35), 4)),
      buildSuggestion('Aggressive', Math.max(Math.round(m.ytdClosedDeals * 0.5), 6)),
    ]);
    const insights: AIInsight[] = [];
    const rates = [
      { name: 'Contact → Appointment', val: m.contactToApptPct },
      { name: 'Appointment → Contract', val: m.apptToContractPct },
      { name: 'CMA → Listing', val: m.cmaToListingPct },
      { name: 'Dials → Appointment', val: m.dialsToApptPct },
    ];
    const weakest = rates.reduce((a, b) => (a.val < b.val ? a : b));
    insights.push({ text: `Your bottleneck is ${weakest.name} at ${weakest.val}%.`, type: 'warning' });
    if (m.gapToTarget > 0) {
      insights.push({ text: `At current pace, you will miss your annual target by ${formatCurrency(m.gapToTarget)}.`, type: 'warning' });
    }
    if (pipelineGap > 0) {
      const gapCMAs = effectiveRates.cmaToListing > 0 ? Math.ceil(pipelineGap / (effectiveRates.cmaToListing / 100)) : 0;
      insights.push({ text: `Pipeline deficit of ${pipelineGap} deals. Increasing weekly CMAs by ${Math.ceil(gapCMAs / 13)} eliminates it.`, type: 'action' });
    }
    if (m.weeklyAvgDials < 50) {
      insights.push({ text: `Weekly dial volume (${m.weeklyAvgDials}) is below minimum threshold. Increase to 50+.`, type: 'warning' });
    }
    setAiInsights(insights);
  };

  const acceptSuggestion = (idx: number) => {
    const s = aiSuggestions[idx];
    if (!s) return;
    setSelectedSuggestion(idx);
    setGoals(g => ({ ...g, gci_target: s.gci }));
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-gold" />
            Q{quarter} Strategy & Goals
          </CardTitle>
          {!isViewingAsAgent && (
            <Button size="sm" onClick={saveGoals} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">Save</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { key: 'gci_target', label: `Q${quarter} GCI Target` },
            { key: 'avg_commission', label: 'Avg Commission / Deal' },
            { key: 'split_percent', label: 'Split %' },
            { key: 'avg_sale_price', label: 'Avg Sale Price' },
          ] as const).map(f => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                value={goals[f.key] || ''}
                onChange={e => { setGoals(g => ({ ...g, [f.key]: Number(e.target.value) })); if (f.key === 'gci_target') setSelectedSuggestion(null); }}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
            </div>
          ))}
        </div>

        {/* Planning mode: editable conversion rates */}
        {mode === 'planning' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              { key: 'contact_to_appt_rate', label: 'Contact → Appt %' },
              { key: 'appt_to_contract_rate', label: 'Appt → Contract %' },
              { key: 'cma_to_listing_rate', label: 'CMA → Listing %' },
              { key: 'dials_to_appt_rate', label: 'Dials → Appt %' },
            ] as const).map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  value={goals[f.key] || ''}
                  onChange={e => setGoals(g => ({ ...g, [f.key]: Number(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
        )}

        {/* Breakdown */}
        {goals.gci_target > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Required Activity Breakdown</h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-4 gap-4 py-2 px-3 bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Metric</span><span className="text-center">Monthly</span><span className="text-center">Weekly</span><span className="text-center">Daily</span>
                </div>
                <BreakdownRow label="Closings" monthly={monthly(requiredClosings)} weekly={weekly(requiredClosings)} daily={daily(requiredClosings)} />
                <BreakdownRow label="Listings" monthly={monthly(requiredListings)} weekly={weekly(requiredListings)} daily={daily(requiredListings)} />
                <BreakdownRow label="CMAs" monthly={monthly(requiredCMAs)} weekly={weekly(requiredCMAs)} daily={daily(requiredCMAs)} />
                <BreakdownRow label="Appointments" monthly={monthly(requiredAppts)} weekly={weekly(requiredAppts)} daily={daily(requiredAppts)} />
                <BreakdownRow label="Contacts" monthly={monthly(requiredContacts)} weekly={weekly(requiredContacts)} daily={daily(requiredContacts)} />
                <BreakdownRow label="Dials" monthly={monthly(requiredDials)} weekly={weekly(requiredDials)} daily={daily(requiredDials)} />
              </div>
            </div>
          </>
        )}

        {/* AI Suggestions (Active Only) */}
        {mode === 'active' && metrics && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Brain className="h-4 w-4" /> AI-Suggested Q{quarter} Targets
                </h3>
                <Button size="sm" variant="outline" onClick={generateAISuggestions} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  <span className="ml-1">Generate</span>
                </Button>
              </div>

              {aiSuggestions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  {aiSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-4 cursor-pointer transition-all ${selectedSuggestion === i ? 'border-gold bg-gold/10 ring-1 ring-gold' : 'border-border bg-card hover:border-gold/50'}`}
                      onClick={() => acceptSuggestion(i)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-foreground">{s.label}</span>
                        <span className="text-lg font-bold text-gold">{formatCurrency(s.gci)}</span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{s.closings} closings required</p>
                        <p>{s.weeklyDials} dials/wk · {s.weeklyContacts} contacts/wk</p>
                        <p>{s.weeklyAppts} appts/wk · {s.weeklyCMAs} CMAs/wk</p>
                      </div>
                      {selectedSuggestion === i && <Badge className="mt-2 bg-gold text-gold-foreground text-xs">Selected</Badge>}
                    </div>
                  ))}
                </div>
              )}

              {aiInsights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tactical Insights</h4>
                  {aiInsights.map((insight, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${insight.type === 'warning' ? 'bg-destructive/5 border border-destructive/20 text-destructive' : insight.type === 'action' ? 'bg-gold/5 border border-gold/20 text-foreground' : 'bg-muted/50 border border-border text-foreground'}`}>
                      {insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-gold" />}
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
