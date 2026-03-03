import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useFubDealMetrics, ACTIVE_LISTING_STAGES } from '@/hooks/useFubDealMetrics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, BarChart3, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { PerformanceRealityTab } from '@/components/business-planning/PerformanceRealityTab';
import { ReflectionTab } from '@/components/business-planning/ReflectionTab';
import { StrategyGoalsTab } from '@/components/business-planning/StrategyGoalsTab';
import { ActionPlanTab } from '@/components/business-planning/ActionPlanTab';
import { ActiveMetrics, GoalInputs, defaultGoals, currentYear, safe, pct } from '@/components/business-planning/types';

const BusinessPlanning = () => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const { isAdmin } = useUserRole();
  const { effectiveUserId, effectiveFubUserId, isViewingAsAgent, viewingAgentName } = useViewAsAgent();

  const [mode, setMode] = useState<'active' | 'planning'>(hasFUB ? 'active' : 'planning');
  const [quarter, setQuarter] = useState(2);
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
    agentName: viewingAgentName, dateStart, dateEnd,
  });

  // ─── Active listings from FUB deals ───
  const isActiveListing = (stageName: string) => {
    const s = (stageName || '').toLowerCase();
    return ACTIVE_LISTING_STAGES.some(als => s.includes(als));
  };
  const isDealOwnedByAgent = (deal: any, fubId: number | null) => {
    if (!fubId) return true;
    return deal.assignedUserId === fubId || deal.userId === fubId || deal.users?.some((u: any) => u.id === fubId);
  };
  const fubActiveListings = allDeals.filter(d => isActiveListing(d.stageName) && isDealOwnedByAgent(d, effectiveFubUserId));
  const activeListingsBeforeOwnerFilter = allDeals.filter(d => isActiveListing(d.stageName));
  const activeListingDebug = {
    effectiveFubUserId,
    stagesIncluded: ACTIVE_LISTING_STAGES,
    rawDealCount: allDeals.length,
    activeBeforeOwnerFilter: activeListingsBeforeOwnerFilter.length,
    activeListingCount: fubActiveListings.length,
    top5: fubActiveListings.slice(0, 5).map(d => ({
      id: d.id, stage: d.stageName, pipeline: d.pipelineName,
      assignedUserId: (d as any).assignedUserId, userId: (d as any).userId,
      users: d.users?.map(u => `${u.name} (${u.id})`).join(', ') || 'none',
    })),
  };

  // ─── Supplemental metrics (411, CMA, production goals) ───
  const [suppMetrics, setSuppMetrics] = useState<{
    cmaToListingPct: number; totalCMAs: number; totalListings: number;
    contactToApptPct: number; apptToContractPct: number; dialsToApptPct: number;
    weeklyAvgDials: number; weeklyAvgContacts: number; weeklyAvgAppts: number; weeklyAvgCMAs: number;
    totalAppts: number; totalContracts: number; totalContacts: number; totalDials: number; weeksOfData: number;
    targetGCI: number;
  } | null>(null);
  const [suppLoading, setSuppLoading] = useState(true);

  const fetchSupplemental = useCallback(async () => {
    if (!uid) return;
    setSuppLoading(true);
    const yearStart = `${currentYear}-01-01`;
    const [cmaRes, w411Res, goalsRes] = await Promise.all([
      supabase.from('cma_reports').select('listing_status').eq('user_id', uid),
      supabase.from('weekly_411').select('dials, contacts_made, appointments_held, contracts_signed, week_start_date').eq('user_id', uid).gte('week_start_date', yearStart),
      supabase.from('production_goals').select('annual_gci_goal').eq('user_id', uid).eq('year', currentYear).maybeSingle(),
    ]);
    const cmas = cmaRes.data || [];
    const w411 = w411Res.data || [];
    const totalCMAs = cmas.length;
    const convertedCMAs = cmas.filter(c => ['Listing Signed', 'Active', 'Sold'].includes(c.listing_status)).length;
    const totalDials = w411.reduce((s, w) => s + safe(w.dials), 0);
    const totalContacts = w411.reduce((s, w) => s + safe(w.contacts_made), 0);
    const totalAppts = w411.reduce((s, w) => s + safe(w.appointments_held), 0);
    const totalContracts = w411.reduce((s, w) => s + safe(w.contracts_signed), 0);
    const weeksOfData = Math.max(w411.length, 1);
    const targetGCI = safe(goalsRes.data?.annual_gci_goal);
    setSuppMetrics({
      cmaToListingPct: pct(convertedCMAs, totalCMAs), totalCMAs, totalListings: convertedCMAs,
      contactToApptPct: pct(totalAppts, totalContacts), apptToContractPct: pct(totalContracts, totalAppts),
      dialsToApptPct: pct(totalAppts, totalDials),
      weeklyAvgDials: Math.round(totalDials / weeksOfData), weeklyAvgContacts: Math.round(totalContacts / weeksOfData),
      weeklyAvgAppts: Math.round(totalAppts / weeksOfData), weeklyAvgCMAs: Math.round(totalCMAs / weeksOfData),
      totalAppts, totalContracts, totalContacts, totalDials, weeksOfData, targetGCI,
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
    const avgComm = dealMetrics.deals_closed > 0 ? Math.round(ytdGCI / dealMetrics.deals_closed) : 15000;
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

  // Pre-fill from active metrics
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

  // ─── Bootstrap ───
  useEffect(() => { fetchSupplemental(); fetchGoals(); }, [fetchSupplemental, fetchGoals]);
  useEffect(() => { if (!hasFUB && !isViewingAsAgent) setMode('planning'); }, [hasFUB, isViewingAsAgent]);

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
            uid={uid}
          />
        </TabsContent>

        <TabsContent value="reflection" className="mt-6">
          <ReflectionTab uid={uid} quarter={quarter} isViewingAsAgent={isViewingAsAgent} />
        </TabsContent>

        <TabsContent value="strategy" className="mt-6">
          <StrategyGoalsTab
            metrics={metrics} mode={mode} goals={goals} setGoals={setGoals}
            goalsId={goalsId} setGoalsId={setGoalsId} quarter={quarter}
            uid={uid} isViewingAsAgent={isViewingAsAgent} effectiveRates={effectiveRates}
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
