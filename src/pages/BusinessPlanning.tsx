import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useFubDealMetrics } from '@/hooks/useFubDealMetrics';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle,
  Brain, Save, Loader2, BarChart3, Crosshair, MessageSquare,
  ArrowUp, ArrowDown, Minus, Zap, ChevronRight
} from 'lucide-react';

const currentYear = 2026;

// ─── Helpers ───
const safe = (v: number | null | undefined) => Number(v) || 0;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
const divide = (num: number, den: number) => (den > 0 ? Math.ceil(num / den) : 0);

// ─── Types ───
interface ActiveMetrics {
  ytdClosedDeals: number;
  ytdGCI: number;
  pendingGCI: number;
  activeListings: number;
  cmaToListingPct: number;
  apptToContractPct: number;
  contactToApptPct: number;
  dialsToApptPct: number;
  projectedYearEndGCI: number;
  gapToTarget: number;
  targetGCI: number;
  pendingDeals: number;
  avgCommission: number;
  weeklyAvgDials: number;
  weeklyAvgContacts: number;
  weeklyAvgAppts: number;
  weeklyAvgCMAs: number;
  totalCMAs: number;
  totalListings: number;
  totalAppts: number;
  totalContracts: number;
  totalContacts: number;
  totalDials: number;
  weeksOfData: number;
}

interface Reflection {
  id?: string;
  what_worked: string;
  what_didnt_work: string;
  best_lead_source: string;
  avoided_activity: string;
  negative_habits: string;
  single_improvement: string;
}

interface GoalInputs {
  gci_target: number;
  avg_commission: number;
  split_percent: number;
  avg_sale_price: number;
  contact_to_appt_rate: number;
  appt_to_contract_rate: number;
  cma_to_listing_rate: number;
  dials_to_appt_rate: number;
}

interface AISuggestion {
  label: string;
  closings: number;
  weeklyDials: number;
  weeklyContacts: number;
  weeklyAppts: number;
  weeklyCMAs: number;
  gci: number;
}

interface AIInsight {
  text: string;
  type: 'warning' | 'info' | 'action';
}

const emptyReflection: Reflection = {
  what_worked: '', what_didnt_work: '', best_lead_source: '',
  avoided_activity: '', negative_habits: '', single_improvement: '',
};

const defaultGoals: GoalInputs = {
  gci_target: 0, avg_commission: 15000, split_percent: 70,
  avg_sale_price: 500000, contact_to_appt_rate: 20,
  appt_to_contract_rate: 25, cma_to_listing_rate: 30, dials_to_appt_rate: 10,
};

// ─── Sub-components ───
const StatCard = ({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) => (
  <div className={`rounded-lg border p-4 ${danger ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-2xl font-bold ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>
);

const GapBadge = ({ gap }: { gap: number }) => {
  if (gap > 0) return <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="h-3 w-3" />Pipeline Deficit: {gap} deals</Badge>;
  if (gap === 0) return <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="h-3 w-3" />On Track</Badge>;
  return <Badge className="bg-green-600 text-white gap-1"><TrendingUp className="h-3 w-3" />Ahead by {Math.abs(gap)} deals</Badge>;
};

const BreakdownRow = ({ label, monthly, weekly, daily, highlight }: { label: string; monthly: number; weekly: number; daily: number; highlight?: boolean }) => (
  <div className={`grid grid-cols-4 gap-4 py-2 px-3 rounded ${highlight ? 'bg-destructive/5 border border-destructive/20' : 'even:bg-muted/30'}`}>
    <span className="text-sm font-medium text-foreground">{label}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(monthly)}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(weekly)}</span>
    <span className="text-sm text-center font-semibold">{formatNumber(daily)}</span>
  </div>
);

// ─── Main Component ───
const BusinessPlanning = () => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const { isAdmin } = useUserRole();
  const { effectiveUserId, effectiveFubUserId, isViewingAsAgent, viewingAgentName, canViewAsAgent, agentOptions, setViewingAgentId, setIsViewingAsAgent } = useViewAsAgent();
  const { toast } = useToast();

  const [mode, setMode] = useState<'active' | 'planning'>(hasFUB ? 'active' : 'planning');
  const [saving, setSaving] = useState(false);
  const [quarter, setQuarter] = useState(2);
  const [dateRange, setDateRange] = useState<'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom'>('ytd');
  const [customStart, setCustomStart] = useState(`${currentYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(`${currentYear}-12-31`);

  const uid = effectiveUserId || user?.id;

  // ─── Compute date range bounds ───
  const getDateBounds = (): { dateStart: string; dateEnd: string } => {
    switch (dateRange) {
      case 'q1': return { dateStart: `${currentYear}-01-01`, dateEnd: `${currentYear}-03-31` };
      case 'q2': return { dateStart: `${currentYear}-04-01`, dateEnd: `${currentYear}-06-30` };
      case 'q3': return { dateStart: `${currentYear}-07-01`, dateEnd: `${currentYear}-09-30` };
      case 'q4': return { dateStart: `${currentYear}-10-01`, dateEnd: `${currentYear}-12-31` };
      case 'custom': return { dateStart: customStart, dateEnd: customEnd };
      case 'ytd':
      default: return { dateStart: `${currentYear}-01-01`, dateEnd: `${currentYear}-12-31` };
    }
  };

  const { dateStart, dateEnd } = getDateBounds();

  // ─── Single source of truth: useFubDealMetrics (matches Goals & Reports) ───
  const { metrics: dealMetrics, debugInfo, loading: metricsLoading } = useFubDealMetrics({
    userId: uid,
    fubUserId: effectiveFubUserId,
    year: currentYear,
    hasFUB,
    agentName: viewingAgentName,
    dateStart,
    dateEnd,
  });

  // ─── Supplemental metrics (411 activity, CMA, pipeline, goals) ───
  const [suppMetrics, setSuppMetrics] = useState<{
    cmaToListingPct: number; totalCMAs: number; totalListings: number;
    contactToApptPct: number; apptToContractPct: number; dialsToApptPct: number;
    weeklyAvgDials: number; weeklyAvgContacts: number; weeklyAvgAppts: number; weeklyAvgCMAs: number;
    totalAppts: number; totalContracts: number; totalContacts: number; totalDials: number; weeksOfData: number;
    activeListings: number; targetGCI: number;
  } | null>(null);
  const [suppLoading, setSuppLoading] = useState(true);

  // Active metrics built from hook + supplemental
  const [metrics, setMetrics] = useState<ActiveMetrics | null>(null);

  // Reflection
  const [reflection, setReflection] = useState<Reflection>(emptyReflection);
  const [reflectionId, setReflectionId] = useState<string | null>(null);

  // Goals
  const [goals, setGoals] = useState<GoalInputs>(defaultGoals);
  const [goalsId, setGoalsId] = useState<string | null>(null);

  // AI
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  // ─── Fetch supplemental data (411, CMA, pipeline, production goals) ───
  const fetchSupplemental = useCallback(async () => {
    if (!uid) return;
    const yearStart = `${currentYear}-01-01`;
    setSuppLoading(true);

    const [cmaRes, w411Res, pipelineRes, goalsRes] = await Promise.all([
      supabase.from('cma_reports').select('listing_status').eq('user_id', uid),
      supabase.from('weekly_411').select('dials, contacts_made, appointments_held, contracts_signed, week_start_date').eq('user_id', uid).gte('week_start_date', yearStart),
      supabase.from('pipeline_clients').select('stage').eq('user_id', uid),
      supabase.from('production_goals').select('annual_gci_goal').eq('user_id', uid).eq('year', currentYear).maybeSingle(),
    ]);

    const cmas = cmaRes.data || [];
    const w411 = w411Res.data || [];
    const pipeline = pipelineRes.data || [];

    const totalCMAs = cmas.length;
    const convertedCMAs = cmas.filter(c => ['Listing Signed', 'Active', 'Sold'].includes(c.listing_status)).length;
    const activeListings = pipeline.filter(p => p.stage >= 8).length; // stages 8-10 = likely closings

    const totalDials = w411.reduce((s, w) => s + safe(w.dials), 0);
    const totalContacts = w411.reduce((s, w) => s + safe(w.contacts_made), 0);
    const totalAppts = w411.reduce((s, w) => s + safe(w.appointments_held), 0);
    const totalContracts = w411.reduce((s, w) => s + safe(w.contracts_signed), 0);
    const weeksOfData = Math.max(w411.length, 1);
    const targetGCI = safe(goalsRes.data?.annual_gci_goal);

    setSuppMetrics({
      cmaToListingPct: pct(convertedCMAs, totalCMAs),
      totalCMAs, totalListings: convertedCMAs,
      contactToApptPct: pct(totalAppts, totalContacts),
      apptToContractPct: pct(totalContracts, totalAppts),
      dialsToApptPct: pct(totalAppts, totalDials),
      weeklyAvgDials: Math.round(totalDials / weeksOfData),
      weeklyAvgContacts: Math.round(totalContacts / weeksOfData),
      weeklyAvgAppts: Math.round(totalAppts / weeksOfData),
      weeklyAvgCMAs: Math.round(totalCMAs / weeksOfData),
      totalAppts, totalContracts, totalContacts, totalDials, weeksOfData,
      activeListings, targetGCI,
    });
    setSuppLoading(false);
  }, [uid]);

  // ─── Compose final metrics from hook + supplemental ───
  useEffect(() => {
    if (!dealMetrics || !suppMetrics) return;
    const now = new Date();
    const monthsPassed = now.getMonth() + (now.getDate() / 30);
    const ytdGCI = Math.round(dealMetrics.gci_earned);
    const projected = monthsPassed > 0 ? Math.round((ytdGCI / monthsPassed) * 12) : 0;
    const avgComm = dealMetrics.deals_closed > 0 ? Math.round(ytdGCI / dealMetrics.deals_closed) : 15000;

    setMetrics({
      ytdClosedDeals: dealMetrics.deals_closed,
      ytdGCI,
      pendingGCI: Math.round(dealMetrics.gci_pending),
      activeListings: suppMetrics.activeListings,
      cmaToListingPct: suppMetrics.cmaToListingPct,
      apptToContractPct: suppMetrics.apptToContractPct,
      contactToApptPct: suppMetrics.contactToApptPct,
      dialsToApptPct: suppMetrics.dialsToApptPct,
      projectedYearEndGCI: projected,
      gapToTarget: suppMetrics.targetGCI > 0 ? Math.round(suppMetrics.targetGCI - projected) : 0,
      targetGCI: Math.round(suppMetrics.targetGCI),
      pendingDeals: dealMetrics.deals_pending,
      avgCommission: avgComm,
      weeklyAvgDials: suppMetrics.weeklyAvgDials,
      weeklyAvgContacts: suppMetrics.weeklyAvgContacts,
      weeklyAvgAppts: suppMetrics.weeklyAvgAppts,
      weeklyAvgCMAs: suppMetrics.weeklyAvgCMAs,
      totalCMAs: suppMetrics.totalCMAs,
      totalListings: suppMetrics.totalListings,
      totalAppts: suppMetrics.totalAppts,
      totalContracts: suppMetrics.totalContracts,
      totalContacts: suppMetrics.totalContacts,
      totalDials: suppMetrics.totalDials,
      weeksOfData: suppMetrics.weeksOfData,
    });
  }, [dealMetrics, suppMetrics]);

  const loading = metricsLoading || suppLoading;

  const fetchReflection = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('planning_reflections')
      .select('*')
      .eq('user_id', uid)
      .eq('year', currentYear)
      .eq('quarter', quarter)
      .maybeSingle();
    if (data) {
      setReflection({
        what_worked: data.what_worked || '',
        what_didnt_work: data.what_didnt_work || '',
        best_lead_source: data.best_lead_source || '',
        avoided_activity: data.avoided_activity || '',
        negative_habits: data.negative_habits || '',
        single_improvement: data.single_improvement || '',
      });
      setReflectionId(data.id);
    } else {
      setReflection(emptyReflection);
      setReflectionId(null);
    }
  }, [uid, quarter]);

  const fetchGoals = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('planning_assumptions')
      .select('*')
      .eq('user_id', uid)
      .eq('year', currentYear)
      .eq('quarter', quarter)
      .maybeSingle();
    if (data) {
      setGoals({
        gci_target: safe(data.gci_target),
        avg_commission: safe(data.avg_commission),
        split_percent: safe(data.split_percent),
        avg_sale_price: safe(data.avg_sale_price),
        contact_to_appt_rate: safe(data.contact_to_appt_rate),
        appt_to_contract_rate: safe(data.appt_to_contract_rate),
        cma_to_listing_rate: safe(data.cma_to_listing_rate),
        dials_to_appt_rate: safe(data.dials_to_appt_rate),
      });
      setGoalsId(data.id);
    } else {
      setGoals(defaultGoals);
      setGoalsId(null);
    }
  }, [uid, quarter]);

  // Pre-fill goals from active metrics when no saved goals exist
  useEffect(() => {
    if (mode === 'active' && metrics && !goalsId) {
      setGoals(g => ({
        ...g,
        contact_to_appt_rate: metrics.contactToApptPct || g.contact_to_appt_rate,
        appt_to_contract_rate: metrics.apptToContractPct || g.appt_to_contract_rate,
        cma_to_listing_rate: metrics.cmaToListingPct || g.cma_to_listing_rate,
        dials_to_appt_rate: metrics.dialsToApptPct || g.dials_to_appt_rate,
        avg_commission: metrics.avgCommission || g.avg_commission,
      }));
    }
  }, [mode, metrics, goalsId]);

  // Fetch supplemental + reflection + goals on mount / change
  useEffect(() => {
    fetchSupplemental();
    fetchReflection();
    fetchGoals();
  }, [fetchSupplemental, fetchReflection, fetchGoals]);

  // Update mode when hasFUB changes
  useEffect(() => {
    if (!hasFUB && !isViewingAsAgent) setMode('planning');
  }, [hasFUB, isViewingAsAgent]);

  // ─── Saves ───
  const saveReflection = async () => {
    if (!user?.id) return;
    const saveUid = isViewingAsAgent ? uid : user.id;
    if (isViewingAsAgent) return; // admin can view but not edit other agents
    setSaving(true);
    const payload = { ...reflection, user_id: saveUid!, year: currentYear, quarter };
    if (reflectionId) {
      await supabase.from('planning_reflections').update(payload).eq('id', reflectionId);
    } else {
      const { data } = await supabase.from('planning_reflections').insert(payload).select('id').single();
      if (data) setReflectionId(data.id);
    }
    toast({ title: 'Reflection saved' });
    setSaving(false);
  };

  const saveGoals = async () => {
    if (!user?.id) return;
    if (isViewingAsAgent) return;
    setSaving(true);
    const payload = { ...goals, user_id: user.id, year: currentYear, quarter };
    if (goalsId) {
      await supabase.from('planning_assumptions').update(payload).eq('id', goalsId);
    } else {
      const { data } = await supabase.from('planning_assumptions').insert(payload).select('id').single();
      if (data) setGoalsId(data.id);
    }
    toast({ title: 'Goals saved' });
    setSaving(false);
  };

  // ─── Goal calculations ───
  const effectiveRates = mode === 'active' && metrics ? {
    contactToAppt: metrics.contactToApptPct || goals.contact_to_appt_rate,
    apptToContract: metrics.apptToContractPct || goals.appt_to_contract_rate,
    cmaToListing: metrics.cmaToListingPct || goals.cma_to_listing_rate,
    dialsToAppt: metrics.dialsToApptPct || goals.dials_to_appt_rate,
  } : {
    contactToAppt: goals.contact_to_appt_rate,
    apptToContract: goals.appt_to_contract_rate,
    cmaToListing: goals.cma_to_listing_rate,
    dialsToAppt: goals.dials_to_appt_rate,
  };

  const netPerDeal = goals.avg_commission * (goals.split_percent / 100);
  const requiredClosings = netPerDeal > 0 ? Math.ceil(goals.gci_target / netPerDeal) : 0;
  const requiredListings = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredCMAs = effectiveRates.cmaToListing > 0 ? Math.ceil(requiredListings / (effectiveRates.cmaToListing / 100)) : 0;
  const requiredAppts = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredContacts = effectiveRates.contactToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.contactToAppt / 100)) : 0;
  const requiredDials = effectiveRates.dialsToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.dialsToAppt / 100)) : 0;

  const monthsInQ = 3;
  const weeksInQ = 13;
  const daysInQ = 65; // ~5 working days * 13 weeks
  const monthly = (v: number) => Math.ceil(v / monthsInQ);
  const weekly = (v: number) => Math.ceil(v / weeksInQ);
  const daily = (v: number) => Math.ceil(v / daysInQ);

  // Pipeline gap (active only)
  const pipelineGap = metrics ? requiredClosings - (metrics.pendingDeals + Math.round(metrics.activeListings * 0.5)) : 0;
  const gapCMAs = pipelineGap > 0 && effectiveRates.cmaToListing > 0 ? Math.ceil(pipelineGap / (effectiveRates.cmaToListing / 100)) : 0;
  const gapAppts = pipelineGap > 0 && effectiveRates.apptToContract > 0 ? Math.ceil(pipelineGap / (effectiveRates.apptToContract / 100)) : 0;

  // ─── AI Suggestions ───
  const generateAISuggestions = async () => {
    if (!metrics) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('business-planning-ai', {
        body: {
          metrics: {
            ytdClosedDeals: metrics.ytdClosedDeals,
            ytdGCI: metrics.ytdGCI,
            pendingGCI: metrics.pendingGCI,
            avgCommission: metrics.avgCommission,
            cmaToListingPct: metrics.cmaToListingPct,
            apptToContractPct: metrics.apptToContractPct,
            contactToApptPct: metrics.contactToApptPct,
            dialsToApptPct: metrics.dialsToApptPct,
            weeklyAvgDials: metrics.weeklyAvgDials,
            weeklyAvgContacts: metrics.weeklyAvgContacts,
            weeklyAvgAppts: metrics.weeklyAvgAppts,
            weeklyAvgCMAs: metrics.weeklyAvgCMAs,
            pendingDeals: metrics.pendingDeals,
            activeListings: metrics.activeListings,
            targetGCI: metrics.targetGCI,
            projectedYearEndGCI: metrics.projectedYearEndGCI,
          },
          quarter,
        },
      });
      if (error) throw error;
      if (data?.suggestions) setAiSuggestions(data.suggestions);
      if (data?.insights) setAiInsights(data.insights);
    } catch (e) {
      console.error('AI suggestion error:', e);
      toast({ title: 'Could not generate AI suggestions', variant: 'destructive' });
      // Fallback: generate locally
      generateLocalSuggestions();
    }
    setAiLoading(false);
  };

  const generateLocalSuggestions = () => {
    if (!metrics) return;
    const m = metrics;
    const avgC = m.avgCommission || 15000;
    const wks = 13;

    const conservativeClosings = Math.round(m.ytdClosedDeals * 0.25);
    const realisticClosings = Math.round(m.ytdClosedDeals * 0.35);
    const aggressiveClosings = Math.round(m.ytdClosedDeals * 0.5);

    const buildSuggestion = (label: string, closings: number): AISuggestion => {
      const appts = effectiveRates.apptToContract > 0 ? Math.ceil(closings / (effectiveRates.apptToContract / 100)) : closings * 4;
      const contacts = effectiveRates.contactToAppt > 0 ? Math.ceil(appts / (effectiveRates.contactToAppt / 100)) : appts * 5;
      const dials = effectiveRates.dialsToAppt > 0 ? Math.ceil(appts / (effectiveRates.dialsToAppt / 100)) : appts * 10;
      const cmas = effectiveRates.cmaToListing > 0 ? Math.ceil(closings / (effectiveRates.cmaToListing / 100)) : closings * 3;
      return {
        label, closings, gci: closings * avgC,
        weeklyDials: Math.ceil(dials / wks),
        weeklyContacts: Math.ceil(contacts / wks),
        weeklyAppts: Math.ceil(appts / wks),
        weeklyCMAs: Math.ceil(cmas / wks),
      };
    };

    setAiSuggestions([
      buildSuggestion('Conservative', Math.max(conservativeClosings, 2)),
      buildSuggestion('Realistic', Math.max(realisticClosings, 4)),
      buildSuggestion('Aggressive', Math.max(aggressiveClosings, 6)),
    ]);

    // Generate insights locally
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
      const dealsNeeded = avgC > 0 ? Math.ceil(m.gapToTarget / avgC) : 0;
      const weeksLeft = 26;
      const addlWeekly = weeksLeft > 0 ? Math.ceil(dealsNeeded / weeksLeft) : dealsNeeded;
      insights.push({ text: `Required production increase: ${addlWeekly} additional closings per week.`, type: 'action' });
    }

    if (pipelineGap > 0) {
      insights.push({ text: `Pipeline deficit of ${pipelineGap} deals. Increasing weekly CMAs by ${Math.ceil(gapCMAs / 13)} eliminates your pipeline deficit.`, type: 'action' });
    }

    if (m.weeklyAvgDials < 50) {
      insights.push({ text: `Weekly dial volume (${m.weeklyAvgDials}) is below minimum threshold. Increase to 50+ for consistent pipeline flow.`, type: 'warning' });
    }

    setAiInsights(insights);
  };

  const acceptSuggestion = (idx: number) => {
    const s = aiSuggestions[idx];
    if (!s) return;
    setSelectedSuggestion(idx);
    setGoals(g => ({ ...g, gci_target: s.gci }));
  };

  // ─── Projection Engine ───
  const projections = metrics && goals.gci_target > 0 ? (() => {
    const m = metrics;
    const reqWeeklyDials = weekly(requiredDials);
    const reqWeeklyContacts = weekly(requiredContacts);
    const reqWeeklyAppts = weekly(requiredAppts);
    const dialGap = reqWeeklyDials - m.weeklyAvgDials;
    const contactGap = reqWeeklyContacts - m.weeklyAvgContacts;
    const apptGap = reqWeeklyAppts - m.weeklyAvgAppts;
    const paceGCI = Math.round(m.ytdGCI * 4); // rough Q projection
    const missAmount = goals.gci_target - paceGCI;
    const increasePct = m.weeklyAvgDials > 0 ? Math.round((dialGap / m.weeklyAvgDials) * 100) : 0;
    return { dialGap, contactGap, apptGap, missAmount, increasePct, paceGCI };
  })() : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Debug Panel (admin only) */}
      <DebugMetricsPanel debugInfo={debugInfo} isAdmin={isAdmin} />

      {/* Header + Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Business Planning</h1>
          {isViewingAsAgent && viewingAgentName && (
            <p className="text-sm text-gold">Viewing: {viewingAgentName}</p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={dateRange} onValueChange={v => setDateRange(v as any)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="q1">Q1</SelectItem>
              <SelectItem value="q2">Q2</SelectItem>
              <SelectItem value="q3">Q3</SelectItem>
              <SelectItem value="q4">Q4</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36 text-xs" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36 text-xs" />
            </div>
          )}

          <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue placeholder="Quarter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 Goals</SelectItem>
              <SelectItem value="2">Q2 Goals</SelectItem>
              <SelectItem value="3">Q3 Goals</SelectItem>
              <SelectItem value="4">Q4 Goals</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className={`text-sm font-medium ${mode === 'planning' ? 'text-foreground' : 'text-muted-foreground'}`}>Planning</span>
            <Switch
              checked={mode === 'active'}
              onCheckedChange={c => setMode(c ? 'active' : 'planning')}
              disabled={!hasFUB && !isViewingAsAgent}
            />
            <span className={`text-sm font-medium ${mode === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>Active Agent</span>
          </div>

          {!hasFUB && !isViewingAsAgent && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600">No FUB — Planning Mode Only</Badge>
          )}
        </div>
      </div>

      {/* ═══════════════════ SECTION 1: PERFORMANCE REALITY ═══════════════════ */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-gold" />
            Performance Reality
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              {dateRange === 'ytd' ? 'Year to Date' : dateRange === 'custom' ? `${customStart} → ${customEnd}` : dateRange.toUpperCase()} {currentYear}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {mode === 'active' && metrics ? (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={`${dateRange === 'ytd' ? 'YTD' : dateRange.toUpperCase()} Closed Deals`} value={formatNumber(metrics.ytdClosedDeals)} />
                <StatCard label={`${dateRange === 'ytd' ? 'YTD' : dateRange.toUpperCase()} GCI`} value={formatCurrency(metrics.ytdGCI)} />
                <StatCard label="Pending GCI" value={formatCurrency(metrics.pendingGCI)} />
                <StatCard label="Active Listings" value={formatNumber(metrics.activeListings)} />
              </div>
              {/* Conversion Rates */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="CMA → Listing" value={`${metrics.cmaToListingPct}%`} />
                <StatCard label="Appt → Contract" value={`${metrics.apptToContractPct}%`} />
                <StatCard label="Contact → Appt" value={`${metrics.contactToApptPct}%`} />
                <StatCard label="Dials → Appt" value={`${metrics.dialsToApptPct}%`} />
              </div>
              {/* Projections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatCard
                  label="Projected Year-End GCI"
                  value={formatCurrency(metrics.projectedYearEndGCI)}
                  sub={metrics.targetGCI > 0 ? `Target: ${formatCurrency(metrics.targetGCI)}` : undefined}
                />
                {metrics.targetGCI > 0 && (
                  <StatCard
                    label="Gap to Target"
                    value={metrics.gapToTarget > 0 ? formatCurrency(metrics.gapToTarget) : 'On Track'}
                    danger={metrics.gapToTarget > 0}
                    sub={metrics.gapToTarget > 0 ? 'Shortfall at current pace' : 'Projected to meet or exceed'}
                  />
                )}
              </div>

              {/* Pipeline Gap */}
              <Separator />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Crosshair className="h-4 w-4" /> Pipeline Gap Analysis
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <GapBadge gap={pipelineGap} />
                </div>
                {pipelineGap > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard label="Pipeline Gap" value={`${pipelineGap} deals`} danger />
                    <StatCard label="Additional CMAs Needed" value={formatNumber(gapCMAs)} danger />
                    <StatCard label="Additional Appts Needed" value={formatNumber(gapAppts)} danger />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <StatCard label="Required Q Closings" value={formatNumber(requiredClosings)} />
                  <StatCard label="Pending Deals" value={formatNumber(metrics.pendingDeals)} />
                  <StatCard label="Active Likely Closings" value={formatNumber(Math.round(metrics.activeListings * 0.5))} />
                </div>
              </div>
            </>
          ) : (
            /* Planning Mode */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter your conversion rate assumptions below. These will drive all calculations.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { key: 'contact_to_appt_rate', label: 'Contact → Appt %' },
                  { key: 'appt_to_contract_rate', label: 'Appt → Contract %' },
                  { key: 'cma_to_listing_rate', label: 'CMA → Listing %' },
                  { key: 'dials_to_appt_rate', label: 'Dials → Appt %' },
                ].map(f => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      value={goals[f.key as keyof GoalInputs] || ''}
                      onChange={e => setGoals(g => ({ ...g, [f.key]: Number(e.target.value) }))}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════ SECTION 2: REFLECTION ═══════════════════ */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-gold" />
              Reflection — Q{quarter} {currentYear}
            </CardTitle>
            {!isViewingAsAgent && (
              <Button size="sm" onClick={saveReflection} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Save</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'what_worked', label: 'What worked this quarter?', placeholder: 'List wins, successful strategies, strong lead sources...' },
              { key: 'what_didnt_work', label: 'What did NOT work?', placeholder: 'Failed strategies, wasted time, poor ROI...' },
              { key: 'best_lead_source', label: 'Best lead source?', placeholder: 'SOI, door knocking, online, referrals...' },
              { key: 'avoided_activity', label: 'What activity was avoided?', placeholder: 'Prospecting calls, follow-ups, CMAs...' },
              { key: 'negative_habits', label: 'Negative habits impacting production?', placeholder: 'Inconsistency, no time blocking, avoiding hard calls...' },
              { key: 'single_improvement', label: 'One improvement that would double output?', placeholder: 'Be specific and actionable...' },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs font-semibold uppercase tracking-wider">{f.label}</Label>
                <Textarea
                  value={(reflection as any)[f.key] || ''}
                  onChange={e => setReflection(r => ({ ...r, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="mt-1 min-h-[80px]"
                  readOnly={isViewingAsAgent}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════ SECTION 3: AGGRESSIVE GOAL SETTING ═══════════════════ */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-gold" />
              Aggressive Target — Q{quarter}
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
            <div>
              <Label className="text-xs">Q{quarter} GCI Target</Label>
              <Input
                type="number"
                value={goals.gci_target || ''}
                onChange={e => { setGoals(g => ({ ...g, gci_target: Number(e.target.value) })); setSelectedSuggestion(null); }}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
            </div>
            <div>
              <Label className="text-xs">Avg Commission / Deal</Label>
              <Input
                type="number"
                value={goals.avg_commission || ''}
                onChange={e => setGoals(g => ({ ...g, avg_commission: Number(e.target.value) }))}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
            </div>
            <div>
              <Label className="text-xs">Split %</Label>
              <Input
                type="number"
                value={goals.split_percent || ''}
                onChange={e => setGoals(g => ({ ...g, split_percent: Number(e.target.value) }))}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
            </div>
            <div>
              <Label className="text-xs">Avg Sale Price</Label>
              <Input
                type="number"
                value={goals.avg_sale_price || ''}
                onChange={e => setGoals(g => ({ ...g, avg_sale_price: Number(e.target.value) }))}
                className="mt-1"
                readOnly={isViewingAsAgent}
              />
            </div>
          </div>

          {/* Calculated Requirements */}
          {goals.gci_target > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Required Activity Breakdown</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-4 gap-4 py-2 px-3 bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Metric</span>
                    <span className="text-center">Monthly</span>
                    <span className="text-center">Weekly</span>
                    <span className="text-center">Daily</span>
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
                        className={`rounded-lg border p-4 cursor-pointer transition-all ${
                          selectedSuggestion === i
                            ? 'border-gold bg-gold/10 ring-1 ring-gold'
                            : 'border-border bg-card hover:border-gold/50'
                        }`}
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
                        {selectedSuggestion === i && (
                          <Badge className="mt-2 bg-gold text-gold-foreground text-xs">Selected</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Tactical Insights */}
                {aiInsights.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tactical Insights</h4>
                    {aiInsights.map((insight, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                          insight.type === 'warning'
                            ? 'bg-destructive/5 border border-destructive/20 text-destructive'
                            : insight.type === 'action'
                            ? 'bg-gold/5 border border-gold/20 text-foreground'
                            : 'bg-muted/50 border border-border text-foreground'
                        }`}
                      >
                        {insight.type === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-gold" />
                        )}
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

      {/* ═══════════════════ PROJECTION ENGINE (Active Only) ═══════════════════ */}
      {mode === 'active' && projections && goals.gci_target > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-gold" />
              Required Weekly Execution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Dial Increase / Week', value: projections.dialGap, current: metrics!.weeklyAvgDials, required: weekly(requiredDials) },
                { label: 'Contact Increase / Week', value: projections.contactGap, current: metrics!.weeklyAvgContacts, required: weekly(requiredContacts) },
                { label: 'Appt Increase / Week', value: projections.apptGap, current: metrics!.weeklyAvgAppts, required: weekly(requiredAppts) },
              ].map(p => (
                <div key={p.label} className={`rounded-lg border p-4 ${p.value > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-green-500/40 bg-green-500/5'}`}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{p.label}</p>
                  <p className={`text-2xl font-bold ${p.value > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {p.value > 0 ? `+${formatNumber(p.value)}` : 'On Pace'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: {formatNumber(p.current)} → Required: {formatNumber(p.required)}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projections.missAmount > 0 ? (
                <StatCard label={`At current pace you will miss Q${quarter} by`} value={formatCurrency(projections.missAmount)} danger />
              ) : (
                <StatCard label={`Q${quarter} Projection`} value="On Track" />
              )}
              <StatCard
                label="Required Production Increase"
                value={projections.increasePct > 0 ? `${projections.increasePct}%` : '0%'}
                danger={projections.increasePct > 0}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BusinessPlanning;
