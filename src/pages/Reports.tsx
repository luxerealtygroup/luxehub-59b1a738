import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';
import ConversionReport from '@/components/ConversionReport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useUserRole } from '@/hooks/useUserRole';
import { useFubDealMetrics } from '@/hooks/useFubDealMetrics';
import { DebugMetricsPanel } from '@/components/DebugMetricsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target, DollarSign, Home, Users, TrendingUp, Calendar, CheckCircle2, AlertCircle, BarChart3, ArrowRightLeft } from 'lucide-react';
import { parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import FourOneOne from './FourOneOne';

interface MonthlyGoal {
  deals: number;
  gci: number;
  focus?: string;
  target?: string;
}

interface DealWithSource {
  id: string;
  source: string | null;
  deal_value: number | null;
}

interface DealForForecast {
  id: string;
  client_name: string;
  stage: string;
  deal_value: number | null;
  expected_close_date: string | null;
  commission_amount: number | null;
  gross_commission: number | null;
}

interface PipelineClient {
  id: string;
  client_name: string;
  stage: number;
  client_type: 'buyer' | 'seller';
  projected_sale_amount: number | null;
  projected_gci: number | null;
  expected_pending_date: string | null;
  status: string | null;
  source: string | null;
}

interface Weekly411 {
  calls_goal: number | null;
  calls_actual: number | null;
  appointments_goal: number | null;
  appointments_actual: number | null;
  listings_goal: number | null;
  listings_actual: number | null;
  contracts_goal: number | null;
  contracts_actual: number | null;
  contacts_made: number | null;
  dials: number | null;
  doors_knocked: number | null;
  appointments_set: number | null;
  appointments_held: number | null;
  pipeline_additions: number | null;
  contracts_signed: number | null;
  firm_deals: number | null;
  database_size: number | null;
  priority_1: string | null;
  priority_1_completed: boolean | null;
  priority_2: string | null;
  priority_2_completed: boolean | null;
  priority_3: string | null;
  priority_3_completed: boolean | null;
  priority_4: string | null;
  priority_4_completed: boolean | null;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = 2026;

const Reports = () => {
  const { user } = useAuth();
  const { effectiveUserId, effectiveFubUserId, viewingAgentName } = useViewAsAgent();
  const { hasFUB } = useHasFUB();
  const { isAdmin } = useUserRole();
  const queryUserId = effectiveUserId;
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pipeline';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const { metrics: actualMetrics, debugInfo, loading: metricsLoading } = useFubDealMetrics({
    userId: queryUserId,
    fubUserId: effectiveFubUserId,
    year: currentYear,
    hasFUB,
    agentName: viewingAgentName,
  });
  
  const [goalSettings, setGoalSettings] = useState({
    deals_goal: 0,
    gci_goal: 0,
    avg_sale_price: 350000,
    commission_rate: 3,
    split_percent: 70,
    fallout_rate: 50,
    monthlyDeals: Array(12).fill(0) as number[]
  });
  
  const [pipelineClients, setPipelineClients] = useState<PipelineClient[]>([]);
  const [dealsWithSource, setDealsWithSource] = useState<DealWithSource[]>([]);
  const [forecastDeals, setForecastDeals] = useState<DealForForecast[]>([]);
  const [weekly411, setWeekly411] = useState<Weekly411 | null>(null);

  const fetchAllData = async () => {
    if (!queryUserId) return;
    
    const savedCalcValues = localStorage.getItem(`goalCalcValues_${queryUserId}_${currentYear}`);
    const calcValues = savedCalcValues ? JSON.parse(savedCalcValues) : {
      avg_sale_price: 350000,
      commission_rate: 3,
      split_percent: 70,
      fallout_rate: 50
    };
    
    const { data: goalsData } = await supabase
      .from('agent_goals')
      .select('target_value, goal_type')
      .eq('user_id', queryUserId)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    const dealsGoal = goalsData?.find(g => g.goal_type === 'deals_closed')?.target_value || 0;
    const gciGoal = goalsData?.find(g => g.goal_type === 'revenue')?.target_value || 0;
    
    const savedMonthlyGoals = localStorage.getItem(`monthlyGoals_${queryUserId}_${currentYear}`);
    let monthlyDeals = Array(12).fill(dealsGoal / 12);
    if (savedMonthlyGoals) {
      const parsed = JSON.parse(savedMonthlyGoals);
      monthlyDeals = parsed.map((m: MonthlyGoal) => m.deals || 0);
    }
    
    setGoalSettings({
      deals_goal: dealsGoal,
      gci_goal: gciGoal,
      avg_sale_price: calcValues.avg_sale_price,
      commission_rate: calcValues.commission_rate,
      split_percent: calcValues.split_percent,
      fallout_rate: calcValues.fallout_rate ?? 50,
      monthlyDeals
    });
    
    const { data: clients } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', queryUserId);
    
    setPipelineClients((clients as PipelineClient[]) || []);
    
    const { data: dealsData } = await supabase
      .from('deals')
      .select('id, source, deal_value')
      .eq('user_id', queryUserId);
    
    setDealsWithSource((dealsData as DealWithSource[]) || []);
    
    const { data: forecastDealsData } = await supabase
      .from('deals')
      .select(`
        id, 
        client_name, 
        stage, 
        deal_value, 
        expected_close_date,
        commissions (
          amount,
          gross_commission
        )
      `)
      .eq('user_id', queryUserId)
      .in('stage', ['under_contract', 'offer', 'closed']);
    
    const transformedDeals = (forecastDealsData || []).map((deal: any) => ({
      id: deal.id,
      client_name: deal.client_name,
      stage: deal.stage,
      deal_value: deal.deal_value,
      expected_close_date: deal.expected_close_date,
      commission_amount: deal.commissions?.[0]?.amount || null,
      gross_commission: deal.commissions?.[0]?.gross_commission || null,
    }));
    
    setForecastDeals(transformedDeals as DealForForecast[]);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const weekStart = monday.toISOString().split('T')[0];
    
    const { data: weeklyData } = await supabase
      .from('weekly_411')
      .select('*')
      .eq('user_id', queryUserId)
      .eq('week_start_date', weekStart)
      .maybeSingle();
    
    setWeekly411(weeklyData as Weekly411 | null);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [queryUserId]);

  // Calculations
  const totalDealsGoal = goalSettings.monthlyDeals.reduce((sum, d) => sum + d, 0);
  const totalGciGoal = goalSettings.monthlyDeals.reduce((sum, d) => {
    return sum + (d * goalSettings.avg_sale_price * (goalSettings.commission_rate / 100) * (goalSettings.split_percent / 100));
  }, 0);
  
  const dealsProgress = totalDealsGoal > 0 
    ? Math.min(100, Math.round((actualMetrics.deals_closed / totalDealsGoal) * 100))
    : 0;
  
  const gciProgress = totalGciGoal > 0 
    ? Math.min(100, Math.round((actualMetrics.gci_earned / totalGciGoal) * 100))
    : 0;

  const conversionRate = (100 - goalSettings.fallout_rate) / 100;
  const getPipelineNeeded = (deals: number) => {
    if (conversionRate <= 0) return 0;
    return Math.ceil(deals / conversionRate);
  };

  const getQuarterlyDeals = (qIndex: number) => {
    const startMonth = qIndex * 3;
    return goalSettings.monthlyDeals.slice(startMonth, startMonth + 3).reduce((sum, d) => sum + d, 0);
  };

  const getClientsInQuarter = (qIndex: number) => {
    const startMonth = qIndex * 3;
    const endMonth = startMonth + 2;
    return pipelineClients.filter(c => {
      if (!c.expected_pending_date) return false;
      const date = parseISO(c.expected_pending_date);
      const month = date.getMonth();
      const year = date.getFullYear();
      return year === currentYear && month >= startMonth && month <= endMonth;
    }).length;
  };

  // 411 calculations
  const get411Progress = () => {
    if (!weekly411) return { activities: 0, priorities: 0 };
    
    const callsProgress = (weekly411.calls_goal || 0) > 0 
      ? ((weekly411.calls_actual || 0) / weekly411.calls_goal!) * 100 : 0;
    const apptProgress = (weekly411.appointments_goal || 0) > 0 
      ? ((weekly411.appointments_actual || 0) / weekly411.appointments_goal!) * 100 : 0;
    const listingsProgress = (weekly411.listings_goal || 0) > 0 
      ? ((weekly411.listings_actual || 0) / weekly411.listings_goal!) * 100 : 0;
    const contractsProgress = (weekly411.contracts_goal || 0) > 0 
      ? ((weekly411.contracts_actual || 0) / weekly411.contracts_goal!) * 100 : 0;
    
    const activities = Math.round((callsProgress + apptProgress + listingsProgress + contractsProgress) / 4);
    
    const prioritiesCompleted = [
      weekly411.priority_1_completed,
      weekly411.priority_2_completed,
      weekly411.priority_3_completed,
      weekly411.priority_4_completed
    ].filter(Boolean).length;
    
    const prioritiesTotal = [
      weekly411.priority_1,
      weekly411.priority_2,
      weekly411.priority_3,
      weekly411.priority_4
    ].filter(Boolean).length;
    
    const priorities = prioritiesTotal > 0 ? Math.round((prioritiesCompleted / prioritiesTotal) * 100) : 0;
    
    return { activities, priorities };
  };

  const progress411 = get411Progress();

  // Pipeline summary
  const totalPipelineValue = pipelineClients.reduce((sum, c) => sum + (c.projected_sale_amount || 0), 0);
  const totalPipelineGCI = pipelineClients.reduce((sum, c) => sum + (c.projected_gci || 0), 0);
  const hotLeads = pipelineClients.filter(c => c.stage >= 8).length;
  const buyers = pipelineClients.filter(c => c.client_type === 'buyer').length;
  const sellers = pipelineClients.filter(c => c.client_type === 'seller').length;

  // Commission forecast by month
  const commissionsByMonth = monthNames.map((month, idx) => {
    const monthDeals = forecastDeals.filter(d => {
      if (!d.expected_close_date) return false;
      const date = parseISO(d.expected_close_date);
      return date.getFullYear() === currentYear && date.getMonth() === idx;
    });
    
    const monthGross = monthDeals.reduce((sum, d) => sum + (d.gross_commission || 0), 0);
    const monthNet = monthDeals.reduce((sum, d) => sum + (d.commission_amount || 0), 0);
    const pendingCount = monthDeals.filter(d => d.stage === 'under_contract' || d.stage === 'offer').length;
    const closedCount = monthDeals.filter(d => d.stage === 'closed').length;
    
    return {
      month,
      gci: monthGross,
      net: monthNet,
      pending: pendingCount,
      closed: closedCount,
      total: monthDeals.length,
      goal: goalSettings.monthlyDeals[idx] * goalSettings.avg_sale_price * (goalSettings.commission_rate / 100) * (goalSettings.split_percent / 100)
    };
  });
  
  const totalForecastGross = commissionsByMonth.reduce((sum, m) => sum + m.gci, 0);
  const totalForecastNet = commissionsByMonth.reduce((sum, m) => sum + m.net, 0);
  const totalPendingDeals = forecastDeals.filter(d => d.stage === 'under_contract' || d.stage === 'offer').length;
  const totalClosedDeals = forecastDeals.filter(d => d.stage === 'closed').length;

  const currentMonthIdx = new Date().getMonth();

  // Source of Business report data
  const sourceOfBusinessData = dealsWithSource.reduce((acc, deal) => {
    const source = deal.source || 'Unknown';
    if (!acc[source]) acc[source] = { count: 0, volume: 0 };
    acc[source].count++;
    acc[source].volume += deal.deal_value || 0;
    return acc;
  }, {} as Record<string, { count: number; volume: number }>);

  const pipelineSourceData = pipelineClients.reduce((acc, client) => {
    const source = client.source || 'Unknown';
    if (!acc[source]) acc[source] = { count: 0, gci: 0 };
    acc[source].count++;
    acc[source].gci += client.projected_gci || 0;
    return acc;
  }, {} as Record<string, { count: number; gci: number }>);

  const pipelineSourceArray = Object.entries(pipelineSourceData)
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.count - a.count);

  const sourceOfBusinessArray = Object.entries(sourceOfBusinessData)
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.count - a.count);

  if (loading && metricsLoading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading reports...</div>;
  }

  const sourceColors = [
    'bg-gold/20 border-gold/40 text-gold',
    'bg-blue-500/20 border-blue-500/40 text-blue-400',
    'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
    'bg-purple-500/20 border-purple-500/40 text-purple-400',
    'bg-amber-500/20 border-amber-500/40 text-amber-400',
    'bg-rose-500/20 border-rose-500/40 text-rose-400',
  ];

  return (
    <div className="space-y-6">
      <DebugMetricsPanel debugInfo={debugInfo} isAdmin={isAdmin} />
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">{currentYear} Performance Report</h1>
        <p className="text-muted-foreground mt-1">Complete overview of your goals, pipeline, and weekly progress</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
          <TabsTrigger value="pipeline" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Pipeline & Sales
          </TabsTrigger>
          <TabsTrigger value="budget" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Budget & Finances
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Performance
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="411" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> 4-1-1
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Conversions
          </TabsTrigger>
        </TabsList>

        {/* PIPELINE & SALES TAB */}
        <TabsContent value="pipeline" className="space-y-6">
          {/* Goal Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                    <Home className="h-5 w-5 text-gold" />
                    Deals Progress
                  </CardTitle>
                  <span className={`text-2xl font-bold ${dealsProgress >= 100 ? 'text-green-400' : 'text-gold'}`}>
                    {dealsProgress}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={dealsProgress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-2xl font-bold text-foreground">{actualMetrics.deals_closed}</span>
                    <span className="text-muted-foreground ml-2">/ {Math.round(totalDealsGoal)} goal</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+{actualMetrics.deals_pending} pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-gold" />
                    GCI Progress
                  </CardTitle>
                  <span className={`text-2xl font-bold ${gciProgress >= 100 ? 'text-green-400' : 'text-gold'}`}>
                    {gciProgress}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={gciProgress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-2xl font-bold text-foreground">${actualMetrics.gci_earned.toLocaleString()}</span>
                    <span className="text-muted-foreground ml-2">/ ${Math.round(totalGciGoal).toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+${actualMetrics.gci_pending.toLocaleString()} pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Summary */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-gold" />
                Your Pipeline Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-background/50 border border-gold/20 text-center">
                  <p className="text-xs text-muted-foreground">Total Clients</p>
                  <p className="text-2xl font-bold text-gold">{pipelineClients.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-blue-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Buyers</p>
                  <p className="text-2xl font-bold text-blue-400">{buyers}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-emerald-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Sellers</p>
                  <p className="text-2xl font-bold text-emerald-400">{sellers}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-amber-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Hot Leads (8+)</p>
                  <p className="text-2xl font-bold text-amber-400">{hotLeads}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-green-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Pipeline GCI</p>
                  <p className="text-2xl font-bold text-green-400">{formatCurrency(totalPipelineGCI)}</p>
                </div>
              </div>

              {/* Pipeline by Quarter */}
              <div>
                <p className="text-sm font-medium text-foreground mb-3">
                  Pipeline vs Required by Quarter 
                  <span className="text-xs text-muted-foreground ml-2">({goalSettings.fallout_rate}% fallout rate)</span>
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, qIndex) => {
                    const quarterDeals = getQuarterlyDeals(qIndex);
                    const pipelineNeeded = getPipelineNeeded(quarterDeals);
                    const currentInQuarter = getClientsInQuarter(qIndex);
                    const isOnTrack = currentInQuarter >= pipelineNeeded;
                    return (
                      <div key={quarter} className={`p-3 rounded-lg border text-center ${isOnTrack ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                        <p className="text-sm font-medium text-foreground mb-1">{quarter}</p>
                        <div className="flex items-center justify-center gap-1">
                          {isOnTrack ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-400" />
                          )}
                          <span className={`text-lg font-bold ${isOnTrack ? 'text-green-400' : 'text-amber-400'}`}>
                            {currentInQuarter}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-lg font-bold text-foreground">{pipelineNeeded}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">for {Math.round(quarterDeals).toLocaleString()} deals</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BUDGET & FINANCES TAB */}
        <TabsContent value="budget" className="space-y-6">
          {/* Goal Targets */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gold/10">
                    <TrendingUp className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Sale Price</p>
                    <p className="text-lg font-bold text-gold">${goalSettings.avg_sale_price.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gold/10">
                    <DollarSign className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Commission Rate</p>
                    <p className="text-lg font-bold text-gold">{goalSettings.commission_rate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gold/10">
                    <Users className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Your Split</p>
                    <p className="text-lg font-bold text-gold">{goalSettings.split_percent}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Target className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fallout Rate</p>
                    <p className="text-lg font-bold text-amber-400">{goalSettings.fallout_rate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Commissions Forecast Chart */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-gold" />
                Upcoming Commissions Forecast ({currentYear})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commissionsByMonth} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number, name: string) => {
                        if (name === 'gci') return [`$${value.toLocaleString()}`, 'Gross Commission'];
                        if (name === 'goal') return [`$${Math.round(value).toLocaleString()}`, 'Goal GCI'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="goal" name="goal" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gci" name="gci" radius={[4, 4, 0, 0]}>
                      {commissionsByMonth.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === currentMonthIdx ? 'hsl(var(--primary))' : index < currentMonthIdx ? 'hsl(142 76% 36%)' : 'hsl(45 93% 47%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-muted" /><span className="text-muted-foreground">Goal GCI</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(45 93% 47%)' }} /><span className="text-muted-foreground">Gross Commission (Future)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(142 76% 36%)' }} /><span className="text-muted-foreground">Closed Deals</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-primary" /><span className="text-muted-foreground">Current Month</span></div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-background/50 border border-gold/20">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Gross Commission</p>
                    <p className="text-xl font-bold text-gold">${Math.round(totalForecastGross).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net After Cap</p>
                    <p className="text-xl font-bold text-foreground">${Math.round(totalForecastNet).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending Deals</p>
                    <p className="text-xl font-bold text-amber-400">{totalPendingDeals}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Closed Deals</p>
                    <p className="text-xl font-bold text-green-400">{totalClosedDeals}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="space-y-6">
          {/* Weekly 411 Summary */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gold" />
                This Week's 4-1-1 Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekly411 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Activity Goals</p>
                      <span className={`text-lg font-bold ${progress411.activities >= 80 ? 'text-green-400' : progress411.activities >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {progress411.activities}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Calls</span><span className="text-foreground">{weekly411.calls_actual || 0} / {weekly411.calls_goal || 0}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Appointments</span><span className="text-foreground">{weekly411.appointments_actual || 0} / {weekly411.appointments_goal || 0}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Listings</span><span className="text-foreground">{weekly411.listings_actual || 0} / {weekly411.listings_goal || 0}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contracts</span><span className="text-foreground">{weekly411.contracts_actual || 0} / {weekly411.contracts_goal || 0}</span></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Business Priorities</p>
                      <span className={`text-lg font-bold ${progress411.priorities >= 80 ? 'text-green-400' : progress411.priorities >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {progress411.priorities}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((num) => {
                        const priority = weekly411[`priority_${num}` as keyof Weekly411] as string | null;
                        const completed = weekly411[`priority_${num}_completed` as keyof Weekly411] as boolean | null;
                        if (!priority) return null;
                        return (
                          <div key={num} className="flex items-center gap-2 text-sm">
                            {completed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-muted-foreground flex-shrink-0" />
                            )}
                            <span className={completed ? 'text-muted-foreground line-through' : 'text-foreground'}>{priority}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No 4-1-1 data for this week. Start tracking in the 4-1-1 tab.</p>
              )}
            </CardContent>
          </Card>

          {/* Activity Metrics */}
          {weekly411 && (
            <Card className="border-gold/20 bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                  <Target className="h-5 w-5 text-gold" />
                  Your Weekly Activity Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                  {[
                    { label: 'Contacts', value: weekly411.contacts_made },
                    { label: 'Dials', value: weekly411.dials },
                    { label: 'Doors', value: weekly411.doors_knocked },
                    { label: 'Appts Set', value: weekly411.appointments_set },
                    { label: 'Appts Held', value: weekly411.appointments_held },
                    { label: 'Pipeline+', value: weekly411.pipeline_additions },
                    { label: 'Contracts', value: weekly411.contracts_signed },
                    { label: 'Firm', value: weekly411.firm_deals },
                    { label: 'DB Size', value: weekly411.database_size },
                  ].map(field => (
                    <div key={field.label} className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{field.value || 0}</p>
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Goal Breakdown */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <Target className="h-5 w-5 text-gold" />
                Monthly Goal Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                {monthNames.map((month, index) => {
                  const deals = goalSettings.monthlyDeals[index] || 0;
                  const gci = deals * goalSettings.avg_sale_price * (goalSettings.commission_rate / 100) * (goalSettings.split_percent / 100);
                  return (
                    <div key={month} className="p-2 rounded-lg bg-background/50 border border-primary/10 text-center">
                      <p className="text-xs font-medium text-foreground mb-1">{month}</p>
                      <p className="text-sm font-bold text-gold">{Math.round(deals).toLocaleString()}</p>
                      <p className="text-xs text-green-400">${Math.round(gci / 1000)}k</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Source of Business */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-gold" />
                Source of Business (Deals)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sourceOfBusinessArray.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No deals with source data yet.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sourceOfBusinessArray.map((item, idx) => {
                      const percentage = dealsWithSource.length > 0 ? Math.round((item.count / dealsWithSource.length) * 100) : 0;
                      const colorClass = sourceColors[idx % sourceColors.length];
                      return (
                        <div key={item.source} className={`p-4 rounded-lg border ${colorClass.split(' ').slice(0, 2).join(' ')}`}>
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-medium text-foreground">{item.source}</p>
                            <span className={`text-lg font-bold ${colorClass.split(' ')[2]}`}>{percentage}%</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Deals</span><span className="font-medium">{item.count}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Volume</span><span className="font-medium">${item.volume.toLocaleString()}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 rounded-lg bg-background/50 border border-gold/20">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><p className="text-xs text-muted-foreground">Total Deals</p><p className="text-xl font-bold text-gold">{dealsWithSource.length}</p></div>
                      <div><p className="text-xs text-muted-foreground">Unique Sources</p><p className="text-xl font-bold text-foreground">{sourceOfBusinessArray.length}</p></div>
                      <div><p className="text-xs text-muted-foreground">Total Volume</p><p className="text-xl font-bold text-foreground">${dealsWithSource.reduce((sum, d) => sum + (d.deal_value || 0), 0).toLocaleString()}</p></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline by Source */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-gold" />
                Pipeline by Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineSourceArray.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No pipeline clients yet.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pipelineSourceArray.map((item, idx) => {
                      const percentage = pipelineClients.length > 0 ? Math.round((item.count / pipelineClients.length) * 100) : 0;
                      const colorClass = sourceColors[idx % sourceColors.length];
                      return (
                        <div key={item.source} className={`p-4 rounded-lg border ${colorClass.split(' ').slice(0, 2).join(' ')}`}>
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-medium text-foreground">{item.source}</p>
                            <span className={`text-lg font-bold ${colorClass.split(' ')[2]}`}>{percentage}%</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Clients</span><span className="font-medium">{item.count}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Projected GCI</span><span className="font-medium">${item.gci.toLocaleString()}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 rounded-lg bg-background/50 border border-gold/20">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><p className="text-xs text-muted-foreground">Total Pipeline</p><p className="text-xl font-bold text-gold">{pipelineClients.length}</p></div>
                      <div><p className="text-xs text-muted-foreground">Unique Sources</p><p className="text-xl font-bold text-foreground">{pipelineSourceArray.length}</p></div>
                      <div><p className="text-xs text-muted-foreground">Total Pipeline GCI</p><p className="text-xl font-bold text-foreground">{formatCurrency(totalPipelineGCI)}</p></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4-1-1 TAB */}
        <TabsContent value="411" className="space-y-6">
          <FourOneOne />
        </TabsContent>

        {/* CONVERSIONS TAB */}
        <TabsContent value="conversions" className="space-y-6">
          <ConversionReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
