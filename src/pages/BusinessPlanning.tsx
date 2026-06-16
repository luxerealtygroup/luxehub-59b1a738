import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { aggregate411Rows } from '@/lib/utils/weekly411Fallback';
import { useAuth } from '@/hooks/useAuth';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useFubDealMetrics, ACTIVE_LISTING_STAGES, classifyStage, CLOSED_STAGES, PENDING_STAGES, isActiveListingDeal, inferDealSide, ActiveListingDebugInfo } from '@/hooks/useFubDealMetrics';
import { usePipelineMetrics } from '@/hooks/usePipelineMetrics';
import { useDealMetadata } from '@/hooks/useDealMetadata';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, BarChart3, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { PerformanceRealityTab, PipelineGapData } from '@/components/business-planning/PerformanceRealityTab';
import { ReflectionTab } from '@/components/business-planning/ReflectionTab';
import { StrategyGoalsTab } from '@/components/business-planning/StrategyGoalsTab';
import { ActionPlanTab } from '@/components/business-planning/ActionPlanTab';
import { ActiveMetrics, GoalInputs, defaultGoals, currentYear, safe, pct } from '@/components/business-planning/types';


const BusinessPlanning = () => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const { isAdmin } = useUserRole();
  const { effectiveUserId, effectiveFubUserId, isViewingAsAgent, viewingAgentName } = useViewAsAgent();
  const { metadata: dealMetadataMap } = useDealMetadata();

  const [mode, setMode] = useState<'active' | 'planning'>(hasFUB ? 'active' : 'planning');
  // Default to the quarter being PLANNED: current quarter, or next quarter if we're
  // in the final 3 weeks of the current one (forward-looking planning).
  const getPlanningQuarter = () => {
    const now = new Date();
    const m = now.getMonth(); // 0-11
    const d = now.getDate();
    const currentQ = Math.floor(m / 3) + 1; // 1-4
    const lastMonthOfQ = currentQ * 3 - 1; // 0-indexed: Q1->2, Q2->5, Q3->8, Q4->11
    const inFinalStretch = m === lastMonthOfQ && d >= 10;
    return inFinalStretch ? (currentQ === 4 ? 1 : currentQ + 1) : currentQ;
  };
  const [quarter, setQuarter] = useState(getPlanningQuarter());
  // Force Q3 planning context for the current cycle
  useEffect(() => { setQuarter(3); }, []);
  const [dateRange, setDateRange] = useState<'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom'>('ytd');
  const [customStart, setCustomStart] = useState(`${currentYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(`${currentYear}-12-31`);
  const [activeTab, setActiveTab] = useState('performance');

  const uid = effectiveUserId || user?.id || null;

  // ─── Date range ───
  const getDateBounds = () => {
    switch (dateRange) {
      case 'q1': return { dateStart: `${currentYear}-01-01`, dateEnd: `${currentYear}-03-31` };
      case 'q2': return { dateStart: `${currentYear}-04-01`, dateEnd: `${currentYear}-06-30` };
      case 'q3': return { dateStart: `${currentYear}-07-01`, dateEnd: `${currentYear}-09-30` };
      case 'q4': return { dateStart: `${currentYear}-10-01`, dateEnd: `${currentYear}-12-31` };
      case 'custom': return { dateStart: customStart, dateEnd: customEnd };
      default: return { dateStart: `${currentYear}-01-01`, dateEnd: `${currentYear}-12-31` };
    }
  };
  const { dateStart, dateEnd } = getDateBounds();

  // ─── FUB metrics (single source of truth) ───
  const { metrics: dealMetrics, debugInfo, loading: metricsLoading, allDeals } = useFubDealMetrics({
    userId: uid, fubUserId: effectiveFubUserId, year: currentYear, hasFUB,
    agentName: viewingAgentName, dateStart, dateEnd, dealMetadataMap,
  });

  // ─── Active listings from FUB deals (shared logic) ───
  const isDealOwnedByAgent = (deal: any, fubId: number | null) => {
    if (!fubId) return true;
    return deal.assignedUserId === fubId || deal.userId === fubId || deal.users?.some((u: any) => u.id === fubId);
  };
  const fubActiveListings = allDeals.filter(d => isActiveListingDeal(d) && isDealOwnedByAgent(d, effectiveFubUserId));
  const activeListingsBeforeOwnerFilter = allDeals.filter(d => isActiveListingDeal(d));

  // Debug: offer-stage breakdown
  const offerDeals = allDeals.filter(d => (d.stageName || '').toLowerCase().includes('offer') && isDealOwnedByAgent(d, effectiveFubUserId));
  const offerIncluded = offerDeals.filter(d => isActiveListingDeal(d));
  const offerExcludedBuyer = offerDeals.filter(d => !isActiveListingDeal(d) && inferDealSide(d) === 'buyer');
  const offerUnclassified = offerDeals.filter(d => !isActiveListingDeal(d) && inferDealSide(d) === 'unknown');

  const activeListingDebug: ActiveListingDebugInfo = {
    stagesIncluded: ACTIVE_LISTING_STAGES,
    offerDealsIncluded: offerIncluded.length,
    offerDealsExcludedBuyerSide: offerExcludedBuyer.length,
    offerDealsUnclassified: offerUnclassified.length,
    totalActiveListings: fubActiveListings.length,
    top10: fubActiveListings.slice(0, 10).map(d => ({
      id: d.id, stage: d.stageName, pipeline: d.pipelineName,
      inferredSide: inferDealSide(d),
    })),
  };

  // ─── Pipeline metrics from shared hook (same source as Pipeline tab) ───
  const getQDateRange = (q: number) => {
    const starts: Record<number, string> = { 1: `${currentYear}-01-01`, 2: `${currentYear}-04-01`, 3: `${currentYear}-07-01`, 4: `${currentYear}-10-01` };
    const ends: Record<number, string> = { 1: `${currentYear}-03-31`, 2: `${currentYear}-06-30`, 3: `${currentYear}-09-30`, 4: `${currentYear}-12-31` };
    return { start: starts[q] || starts[1], end: ends[q] || ends[1] };
  };

  const prevQ = quarter > 1 ? quarter - 1 : 4;
  const prevQRange = getQDateRange(prevQ);
  const currQRange = getQDateRange(quarter);
  const combinedQStart = prevQRange.start < currQRange.start ? prevQRange.start : currQRange.start;
  const combinedQEnd = currQRange.end;

  // Shared pipeline_clients query — same table as Pipeline tab
  const pipelineMetrics = usePipelineMetrics({
    userId: uid,
    dateStart: combinedQStart,
    dateEnd: combinedQEnd,
  });

  // ─── YTD carryover through end of prev quarter: closed + in-flight pending ───
  const getCloseDate = (d: any) => d.closedDate || d.closeDate || d.projectedCloseDate || null;
  const ytdStart = `${currentYear}-01-01`;
  // All YTD-through-prevQ closings the agent owns
  const ytdClosedDeals = allDeals.filter(d => {
    if (classifyStage(d.stageName) !== 'closed') return false;
    if (!isDealOwnedByAgent(d, effectiveFubUserId)) return false;
    const cd = getCloseDate(d);
    return cd && cd >= ytdStart && cd <= prevQRange.end;
  });
  // In-flight pending/conditional deals — work already in motion that credits YTD
  const ytdPendingDeals = allDeals.filter(d => {
    if (classifyStage(d.stageName) !== 'pending') return false;
    if (!isDealOwnedByAgent(d, effectiveFubUserId)) return false;
    const cd = getCloseDate(d);
    return !cd || cd >= ytdStart;
  });
  const prevQActualOrPendingCount = ytdClosedDeals.length + ytdPendingDeals.length;

  // ── Quarter-by-quarter closed GCI + units (for outlook card) ──
  const sumGci = (deals: any[]) => Math.round(deals.reduce((s, d) => s + (Number(d.commissionValue) || 0), 0));
  const closedByQuarter = (q: number) => {
    const r = getQDateRange(q);
    return allDeals.filter(d => {
      if (classifyStage(d.stageName) !== 'closed') return false;
      if (!isDealOwnedByAgent(d, effectiveFubUserId)) return false;
      const cd = getCloseDate(d);
      return cd && cd >= r.start && cd <= r.end;
    });
  };
  const q1Closed = closedByQuarter(1);
  const q2Closed = closedByQuarter(2);
  const q1ClosedGci = sumGci(q1Closed);
  const q2ClosedGci = sumGci(q2Closed);
  const q1ClosedUnits = q1Closed.length;
  const q2ClosedUnits = q2Closed.length;

  // Separate firm pending vs conditional (current snapshot, all dates)
  const isConditionalStage = (s: string) => {
    const x = (s || '').toLowerCase();
    return x.includes('conditional') || x.includes('offer');
  };
  const isFirmPendingStage = (s: string) => {
    const x = (s || '').toLowerCase();
    return (x.includes('pending') || x.includes('under contract')) && !isConditionalStage(s);
  };
  const ownedDeals = allDeals.filter(d => isDealOwnedByAgent(d, effectiveFubUserId));
  const firmPendingDeals = ownedDeals.filter(d => isFirmPendingStage(d.stageName));
  const conditionalDeals = ownedDeals.filter(d => isConditionalStage(d.stageName));
  const firmPendingGci = sumGci(firmPendingDeals);
  const conditionalGci = sumGci(conditionalDeals);
  const firmPendingUnits = firmPendingDeals.length;
  const conditionalUnits = conditionalDeals.length;

  // Required closings YTD through end of prev quarter = annual goal × (prevQ / 4)
  const [prevQGoalClosings, setPrevQGoalClosings] = useState(0);
  useEffect(() => {
    if (!uid) return;
    // Derive cumulative YTD-through-prevQ deal goal from annual deals_closed
    supabase.from('agent_goals').select('target_value')
      .eq('user_id', uid).eq('period', 'yearly').eq('goal_type', 'deals_closed').maybeSingle()
      .then(({ data }) => {
        if (data && safe(data.target_value) > 0) {
          setPrevQGoalClosings(Math.ceil(safe(data.target_value) * (prevQ / 4)));
        } else {
          // Fallback: try planning_assumptions
          supabase.from('planning_assumptions').select('gci_target, avg_commission')
            .eq('user_id', uid).eq('year', currentYear).eq('quarter', prevQ).maybeSingle()
            .then(({ data: pa }) => {
              if (pa && safe(pa.avg_commission) > 0 && safe(pa.gci_target) > 0) {
                setPrevQGoalClosings(Math.ceil((safe(pa.gci_target) / safe(pa.avg_commission)) * prevQ));
              } else {
                setPrevQGoalClosings(0);
              }
            });
        }
      });
  }, [uid, prevQ]);

  const pipelineGapData: PipelineGapData = {
    pipelineTotal: pipelineMetrics.clientsInDateRange,
    pipelineTotalAll: pipelineMetrics.totalClients,
    missingDateCount: pipelineMetrics.missingDateCount,
    pipelineDebug: pipelineMetrics.debug,
    prevQActualClosings: prevQActualOrPendingCount,
    prevQRequiredClosings: prevQGoalClosings,
    q1ClosedGci,
    q2ClosedGci,
    firmPendingGci,
    conditionalGci,
    q1ClosedUnits,
    q2ClosedUnits,
    firmPendingUnits,
    conditionalUnits,
  };

  // ─── Supplemental metrics (411, CMA, production goals) ───
  const [suppMetrics, setSuppMetrics] = useState<{
    cmaToListingPct: number; totalCMAs: number; totalListings: number;
    contactToApptPct: number; apptToContractPct: number; dialsToApptPct: number;
    weeklyAvgDials: number; weeklyAvgContacts: number; weeklyAvgAppts: number; weeklyAvgCMAs: number;
    totalAppts: number; totalContracts: number; totalContacts: number; totalDials: number; weeksOfData: number;
    targetGCI: number;
    totalPipelineAdditions: number;
  } | null>(null);
  const [suppLoading, setSuppLoading] = useState(true);

  const fetchSupplemental = useCallback(async () => {
    if (!uid) return;
    setSuppLoading(true);
    const yearStart = `${currentYear}-01-01`;
    const [cmaRes, w411Res, goalsRes] = await Promise.all([
      supabase.from('cma_reports').select('listing_status').eq('user_id', uid),
      supabase.from('weekly_411').select('dials, contacts_made, appointments_set, appointments_held, contracts_signed, doors_knocked, pipeline_additions, firm_deals, database_size, week_start_date, calls_actual, appointments_actual, contracts_actual').eq('user_id', uid).gte('week_start_date', yearStart),
      supabase.from('production_goals').select('annual_gci_goal').eq('user_id', uid).eq('year', currentYear).maybeSingle(),
    ]);
    const cmas = cmaRes.data || [];
    const w411 = w411Res.data || [];
    const totalCMAs = cmas.length;
    const convertedCMAs = cmas.filter(c => ['Listing Signed', 'Active', 'Sold'].includes(c.listing_status)).length;
    const agg = aggregate411Rows(w411);
    const totalDials = agg.dials;
    const totalContacts = agg.contacts_made;
    const totalAppts = agg.appointments_held;
    const totalContracts = agg.contracts_signed;
    const totalPipelineAdditions = agg.pipeline_additions;
    const weeksOfData = Math.max(w411.length, 1);
    const targetGCI = safe(goalsRes.data?.annual_gci_goal);
    setSuppMetrics({
      cmaToListingPct: pct(convertedCMAs, totalCMAs), totalCMAs, totalListings: convertedCMAs,
      contactToApptPct: pct(totalAppts, totalContacts), apptToContractPct: pct(totalContracts, totalAppts),
      dialsToApptPct: pct(totalAppts, totalDials),
      weeklyAvgDials: Math.round(totalDials / weeksOfData), weeklyAvgContacts: Math.round(totalContacts / weeksOfData),
      weeklyAvgAppts: Math.round(totalAppts / weeksOfData), weeklyAvgCMAs: Math.round(totalCMAs / weeksOfData),
      totalAppts, totalContracts, totalContacts, totalDials, weeksOfData, targetGCI,
      totalPipelineAdditions,
    });
    setSuppLoading(false);
  }, [uid]);

  // ─── Compose metrics ───
  const [metrics, setMetrics] = useState<ActiveMetrics | null>(null);
  useEffect(() => {
    if (!dealMetrics || !suppMetrics) return;
    const now = new Date();
    const monthsPassed = now.getMonth() + (now.getDate() / 30);
    const ytdGCI = Math.round(dealMetrics.gci_earned);
    const projected = monthsPassed > 0 ? Math.round((ytdGCI / monthsPassed) * 12) : 0;
    const avgComm = dealMetrics.sales_count_closed > 0 ? Math.round(ytdGCI / dealMetrics.sales_count_closed) : 15000;
    setMetrics({
      ytdClosedDeals: dealMetrics.deals_closed, ytdGCI, pendingGCI: Math.round(dealMetrics.gci_pending),
      activeListings: fubActiveListings.length, cmaToListingPct: suppMetrics.cmaToListingPct,
      apptToContractPct: suppMetrics.apptToContractPct, contactToApptPct: suppMetrics.contactToApptPct,
      dialsToApptPct: suppMetrics.dialsToApptPct, projectedYearEndGCI: projected,
      gapToTarget: suppMetrics.targetGCI > 0 ? Math.round(suppMetrics.targetGCI - projected) : 0,
      targetGCI: Math.round(suppMetrics.targetGCI), pendingDeals: dealMetrics.deals_pending,
      avgCommission: avgComm, weeklyAvgDials: suppMetrics.weeklyAvgDials, weeklyAvgContacts: suppMetrics.weeklyAvgContacts,
      weeklyAvgAppts: suppMetrics.weeklyAvgAppts, weeklyAvgCMAs: suppMetrics.weeklyAvgCMAs,
      totalCMAs: suppMetrics.totalCMAs, totalListings: suppMetrics.totalListings,
      totalAppts: suppMetrics.totalAppts, totalContracts: suppMetrics.totalContracts,
      totalContacts: suppMetrics.totalContacts, totalDials: suppMetrics.totalDials,
      weeksOfData: suppMetrics.weeksOfData,
      totalPipelineAdditions: suppMetrics.totalPipelineAdditions,
      weightedClosed: dealMetrics.weighted_closed,
      weightedPending: dealMetrics.weighted_pending,
      weightedDebugClosed: dealMetrics.weighted_debug_closed,
      weightedDebugPending: dealMetrics.weighted_debug_pending,
    });
  }, [dealMetrics, suppMetrics, fubActiveListings.length]);

  // ─── Goals state (shared between Strategy & Action) ───
  const [goals, setGoals] = useState<GoalInputs>(defaultGoals);
  const [goalsId, setGoalsId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('planning_assumptions').select('*')
      .eq('user_id', uid).eq('year', currentYear).eq('quarter', quarter).maybeSingle();
    if (data) {
      setGoals({
        gci_target: safe(data.gci_target), avg_commission: safe(data.avg_commission),
        split_percent: safe(data.split_percent), avg_sale_price: safe(data.avg_sale_price),
        contact_to_appt_rate: safe(data.contact_to_appt_rate), appt_to_contract_rate: safe(data.appt_to_contract_rate),
        cma_to_listing_rate: safe(data.cma_to_listing_rate), dials_to_appt_rate: safe(data.dials_to_appt_rate),
      });
      setGoalsId(data.id);
    } else {
      setGoals(defaultGoals);
      setGoalsId(null);
    }
  }, [uid, quarter]);

  // Pre-fill from active metrics — for active agents, always sync key fields
  useEffect(() => {
    if (mode === 'active' && metrics) {
      setGoals(g => {
        const avgComm = metrics.avgCommission || g.avg_commission;
        // Auto-derive quarterly GCI target from annual target
        const annualTarget = metrics.targetGCI || 0;
        const autoQGci = annualTarget > 0 ? Math.round(annualTarget / 4) : g.gci_target;
        // Auto-derive average sale price from FUB closed-deal volume
        const autoAvgSalePrice = (dealMetrics && dealMetrics.sales_count_closed > 0 && dealMetrics.sales_volume_closed > 0)
          ? Math.round(dealMetrics.sales_volume_closed / dealMetrics.sales_count_closed)
          : g.avg_sale_price;
        return {
          ...g,
          contact_to_appt_rate: metrics.contactToApptPct || g.contact_to_appt_rate,
          appt_to_contract_rate: metrics.apptToContractPct || g.appt_to_contract_rate,
          cma_to_listing_rate: metrics.cmaToListingPct || g.cma_to_listing_rate,
          dials_to_appt_rate: metrics.dialsToApptPct || g.dials_to_appt_rate,
          avg_commission: avgComm,
          gci_target: autoQGci,
          avg_sale_price: autoAvgSalePrice,
        };
      });
    }
  }, [mode, metrics, dealMetrics]);

  // ─── Bootstrap ───
  useEffect(() => { fetchSupplemental(); fetchGoals(); }, [fetchSupplemental, fetchGoals]);
  useEffect(() => {
    if (!hasFUB && !isViewingAsAgent) setMode('planning');
    else setMode('active');
  }, [hasFUB, isViewingAsAgent]);

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

  const loading = metricsLoading || suppLoading;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Business Planning</h1>
          {isViewingAsAgent && viewingAgentName && (
            <p className="text-sm text-gold">Viewing: {viewingAgentName}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 Goals</SelectItem>
              <SelectItem value="2">Q2 Goals</SelectItem>
              <SelectItem value="3">Q3 Goals</SelectItem>
              <SelectItem value="4">Q4 Goals</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className={`text-sm font-medium ${mode === 'planning' ? 'text-foreground' : 'text-muted-foreground'}`}>Planning</span>
            <Switch checked={mode === 'active'} onCheckedChange={c => setMode(c ? 'active' : 'planning')} disabled={!hasFUB && !isViewingAsAgent} />
            <span className={`text-sm font-medium ${mode === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>Active Agent</span>
          </div>
          {!hasFUB && !isViewingAsAgent && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600">No FUB — Planning Mode Only</Badge>
          )}
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="performance" className="gap-2"><BarChart3 className="h-4 w-4" />Performance Reality</TabsTrigger>
          <TabsTrigger value="reflection" className="gap-2"><MessageSquare className="h-4 w-4" />Reflection & Mindset</TabsTrigger>
          <TabsTrigger value="strategy" className="gap-2"><Target className="h-4 w-4" />Q{quarter} Strategy & Goals</TabsTrigger>
          <TabsTrigger value="action" className="gap-2"><TrendingUp className="h-4 w-4" />Action Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-6">
          <PerformanceRealityTab
            metrics={metrics} mode={mode} dateRange={dateRange}
            customStart={customStart} customEnd={customEnd}
            isAdmin={isAdmin} debugInfo={debugInfo}
            activeListingDebug={activeListingDebug}
            goals={goals} effectiveRates={effectiveRates}
            uid={uid} quarter={quarter}
            pipelineGapData={pipelineGapData}
          />
        </TabsContent>

        <TabsContent value="reflection" className="mt-6">
          {/* Reflection & Mindset tied to the quarter being planned */}
          <ReflectionTab uid={uid} quarter={quarter} isViewingAsAgent={isViewingAsAgent} />
        </TabsContent>

        <TabsContent value="strategy" className="mt-6">
          <StrategyGoalsTab
            metrics={metrics} mode={mode} goals={goals} setGoals={setGoals}
            goalsId={goalsId} setGoalsId={setGoalsId} quarter={quarter}
            uid={uid} isViewingAsAgent={isViewingAsAgent} effectiveRates={effectiveRates}
            prevQActualClosings={pipelineGapData.prevQActualClosings}
            prevQGoalClosings={pipelineGapData.prevQRequiredClosings}
            currentPipeline={pipelineGapData.pipelineTotal}
          />
        </TabsContent>

        <TabsContent value="action" className="mt-6">
          <ActionPlanTab
            metrics={metrics} mode={mode} goals={goals} quarter={quarter}
            uid={uid} isViewingAsAgent={isViewingAsAgent} effectiveRates={effectiveRates}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BusinessPlanning;
