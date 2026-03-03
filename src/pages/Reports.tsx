import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import ConversionReport from '@/components/ConversionReport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, DollarSign, Home, Users, TrendingUp, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
  commission_amount: number | null; // Actual agent commission (net after splits)
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
  const [loading, setLoading] = useState(true);
  
  // Goal data
  const [goalSettings, setGoalSettings] = useState({
    deals_goal: 0,
    gci_goal: 0,
    avg_sale_price: 350000,
    commission_rate: 3,
    split_percent: 70,
    fallout_rate: 50,
    monthlyDeals: Array(12).fill(0) as number[]
  });
  
  // Actual metrics
  const [actualMetrics, setActualMetrics] = useState({
    deals_closed: 0,
    deals_pending: 0,
    gci_earned: 0,
    gci_pending: 0
  });
  
  // Pipeline data
  const [pipelineClients, setPipelineClients] = useState<PipelineClient[]>([]);
  
  // Deals with source for source of business report
  const [dealsWithSource, setDealsWithSource] = useState<DealWithSource[]>([]);
  
  // Deals for commission forecast (pending and closed)
  const [forecastDeals, setForecastDeals] = useState<DealForForecast[]>([]);
  
  // 411 data
  const [weekly411, setWeekly411] = useState<Weekly411 | null>(null);

  const fetchAllData = async () => {
    if (!user) return;
    
    // Fetch goal settings
    const savedCalcValues = localStorage.getItem(`goalCalcValues_${user.id}_${currentYear}`);
    const calcValues = savedCalcValues ? JSON.parse(savedCalcValues) : {
      avg_sale_price: 350000,
      commission_rate: 3,
      split_percent: 70,
      fallout_rate: 50
    };
    
    // Fetch annual goals from agent_goals
    const { data: goalsData } = await supabase
      .from('agent_goals')
      .select('target_value, goal_type')
      .eq('user_id', user.id)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    const dealsGoal = goalsData?.find(g => g.goal_type === 'deals_closed')?.target_value || 0;
    const gciGoal = goalsData?.find(g => g.goal_type === 'revenue')?.target_value || 0;
    
    // Fetch monthly goals
    const savedMonthlyGoals = localStorage.getItem(`monthlyGoals_${user.id}_${currentYear}`);
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
    
    // Fetch actual metrics
    const { data: closedDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', user.id)
      .eq('stage', 'closed');
    
    const { data: pendingDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', user.id)
      .in('stage', ['under_contract', 'offer']);
    
    const { data: paidCommissions } = await supabase
      .from('commissions')
      .select('gross_commission, amount')
      .eq('user_id', user.id)
      .eq('status', 'paid');
    
    const { data: pendingCommissions } = await supabase
      .from('commissions')
      .select('gross_commission, amount')
      .eq('user_id', user.id)
      .eq('status', 'pending');
    
    setActualMetrics({
      deals_closed: closedDeals?.length || 0,
      deals_pending: pendingDeals?.length || 0,
      gci_earned: paidCommissions?.reduce((sum, c) => sum + (c.gross_commission || c.amount || 0), 0) || 0,
      gci_pending: pendingCommissions?.reduce((sum, c) => sum + (c.gross_commission || c.amount || 0), 0) || 0
    });
    
    // Fetch pipeline clients
    const { data: clients } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', user.id);
    
    setPipelineClients((clients as PipelineClient[]) || []);
    
    // Fetch deals with source for source of business report
    const { data: dealsData } = await supabase
      .from('deals')
      .select('id, source, deal_value')
      .eq('user_id', user.id);
    
    setDealsWithSource((dealsData as DealWithSource[]) || []);
    
    // Fetch deals with commissions for forecast (pending and closed deals)
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
      .eq('user_id', user.id)
      .in('stage', ['under_contract', 'offer', 'closed']);
    
    // Transform the data to include commission amounts
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
    // Fetch current week's 411
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const weekStart = monday.toISOString().split('T')[0];
    
    const { data: weeklyData } = await supabase
      .from('weekly_411')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();
    
    setWeekly411(weeklyData as Weekly411 | null);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [user]);

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

  // Commission forecast by month (from actual pending/closed deals with real commission amounts)
  const commissionsByMonth = monthNames.map((month, idx) => {
    const monthDeals = forecastDeals.filter(d => {
      if (!d.expected_close_date) return false;
      const date = parseISO(d.expected_close_date);
      return date.getFullYear() === currentYear && date.getMonth() === idx;
    });
    
    // Use gross commission as primary metric
    const monthGross = monthDeals.reduce((sum, d) => {
      return sum + (d.gross_commission || 0);
    }, 0);
    
    // Net after cap
    const monthNet = monthDeals.reduce((sum, d) => {
      return sum + (d.commission_amount || 0);
    }, 0);
    
    const pendingCount = monthDeals.filter(d => d.stage === 'under_contract' || d.stage === 'offer').length;
    const closedCount = monthDeals.filter(d => d.stage === 'closed').length;
    
    return {
      month,
      gci: monthGross, // Gross agent commission
      net: monthNet,   // Net after cap
      pending: pendingCount,
      closed: closedCount,
      total: monthDeals.length,
      goal: goalSettings.monthlyDeals[idx] * goalSettings.avg_sale_price * (goalSettings.commission_rate / 100) * (goalSettings.split_percent / 100)
    };
  });
  
  // Calculate totals for forecast summary (using gross)
  const totalForecastGross = commissionsByMonth.reduce((sum, m) => sum + m.gci, 0);
  const totalForecastNet = commissionsByMonth.reduce((sum, m) => sum + m.net, 0);
  const totalPendingDeals = forecastDeals.filter(d => d.stage === 'under_contract' || d.stage === 'offer').length;
  const totalClosedDeals = forecastDeals.filter(d => d.stage === 'closed').length;

  const currentMonthIdx = new Date().getMonth();

  // Source of Business report data (from deals)
  const sourceOfBusinessData = dealsWithSource.reduce((acc, deal) => {
    const source = deal.source || 'Unknown';
    if (!acc[source]) {
      acc[source] = { count: 0, volume: 0 };
    }
    acc[source].count++;
    acc[source].volume += deal.deal_value || 0;
    return acc;
  }, {} as Record<string, { count: number; volume: number }>);

  // Pipeline Source report data
  const pipelineSourceData = pipelineClients.reduce((acc, client) => {
    const source = client.source || 'Unknown';
    if (!acc[source]) {
      acc[source] = { count: 0, gci: 0 };
    }
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

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading reports...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">{currentYear} Performance Report</h1>
        <p className="text-muted-foreground mt-1">Complete overview of your goals, pipeline, and weekly progress</p>
      </div>

      {/* Goal Progress Section */}
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
                <span className="text-muted-foreground ml-2">/ {totalDealsGoal.toFixed(0)} goal</span>
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
            Pipeline Summary
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

          {/* Pipeline Requirements by Quarter */}
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
                    <p className="text-xs text-muted-foreground">for {quarterDeals.toFixed(1)} deals</p>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly 411 Progress */}
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
              {/* Activity Progress */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Activity Goals</p>
                  <span className={`text-lg font-bold ${progress411.activities >= 80 ? 'text-green-400' : progress411.activities >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {progress411.activities}%
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Calls</span>
                    <span className="text-foreground">{weekly411.calls_actual || 0} / {weekly411.calls_goal || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Appointments</span>
                    <span className="text-foreground">{weekly411.appointments_actual || 0} / {weekly411.appointments_goal || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Listings</span>
                    <span className="text-foreground">{weekly411.listings_actual || 0} / {weekly411.listings_goal || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contracts</span>
                    <span className="text-foreground">{weekly411.contracts_actual || 0} / {weekly411.contracts_goal || 0}</span>
                  </div>
                </div>
              </div>

              {/* Priorities Progress */}
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
                        <span className={completed ? 'text-muted-foreground line-through' : 'text-foreground'}>
                          {priority}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No 4-1-1 data for this week. Start tracking in the 4-1-1 page.</p>
          )}
        </CardContent>
      </Card>

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
                  <p className="text-sm font-bold text-gold">{deals.toFixed(1)}</p>
                  <p className="text-xs text-green-400">${Math.round(gci / 1000)}k</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Summary */}
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

      {/* Upcoming Commissions Chart */}
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
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'gci') return [`$${value.toLocaleString()}`, 'Gross Commission'];
                    if (name === 'goal') return [`$${Math.round(value).toLocaleString()}`, 'Goal GCI'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="goal" name="goal" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gci" name="gci" radius={[4, 4, 0, 0]}>
                  {commissionsByMonth.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === currentMonthIdx ? 'hsl(var(--primary))' : index < currentMonthIdx ? 'hsl(142 76% 36%)' : 'hsl(45 93% 47%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-muted" />
              <span className="text-muted-foreground">Goal GCI</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(45 93% 47%)' }} />
              <span className="text-muted-foreground">Gross Commission (Future)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(142 76% 36%)' }} />
              <span className="text-muted-foreground">Closed Deals</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary" />
              <span className="text-muted-foreground">Current Month</span>
            </div>
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

      {/* Source of Business Report */}
      <Card className="border-gold/20 bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gold" />
            Source of Business (Deals)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceOfBusinessArray.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No deals with source data yet. Import deals from Follow Up Boss or add source when creating deals.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sourceOfBusinessArray.map((item, idx) => {
                  const percentage = dealsWithSource.length > 0 
                    ? Math.round((item.count / dealsWithSource.length) * 100) 
                    : 0;
                  const colors = [
                    'bg-gold/20 border-gold/40 text-gold',
                    'bg-blue-500/20 border-blue-500/40 text-blue-400',
                    'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
                    'bg-purple-500/20 border-purple-500/40 text-purple-400',
                    'bg-amber-500/20 border-amber-500/40 text-amber-400',
                    'bg-rose-500/20 border-rose-500/40 text-rose-400',
                  ];
                  const colorClass = colors[idx % colors.length];
                  
                  return (
                    <div 
                      key={item.source} 
                      className={`p-4 rounded-lg border ${colorClass.split(' ').slice(0, 2).join(' ')}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-foreground">{item.source}</p>
                        <span className={`text-lg font-bold ${colorClass.split(' ')[2]}`}>{percentage}%</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Deals</span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Volume</span>
                          <span className="font-medium">${item.volume.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="p-3 rounded-lg bg-background/50 border border-gold/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Deals</p>
                    <p className="text-xl font-bold text-gold">{dealsWithSource.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unique Sources</p>
                    <p className="text-xl font-bold text-foreground">{sourceOfBusinessArray.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Volume</p>
                    <p className="text-xl font-bold text-foreground">
                      ${dealsWithSource.reduce((sum, d) => sum + (d.deal_value || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Source Report */}
      <Card className="border-gold/20 bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-gold" />
            Pipeline by Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineSourceArray.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No pipeline clients yet. Add clients to see source breakdown.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pipelineSourceArray.map((item, idx) => {
                  const percentage = pipelineClients.length > 0 
                    ? Math.round((item.count / pipelineClients.length) * 100) 
                    : 0;
                  const colors = [
                    'bg-blue-500/20 border-blue-500/40 text-blue-400',
                    'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
                    'bg-purple-500/20 border-purple-500/40 text-purple-400',
                    'bg-gold/20 border-gold/40 text-gold',
                    'bg-amber-500/20 border-amber-500/40 text-amber-400',
                    'bg-rose-500/20 border-rose-500/40 text-rose-400',
                  ];
                  const colorClass = colors[idx % colors.length];
                  
                  return (
                    <div 
                      key={item.source} 
                      className={`p-4 rounded-lg border ${colorClass.split(' ').slice(0, 2).join(' ')}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-foreground">{item.source}</p>
                        <span className={`text-lg font-bold ${colorClass.split(' ')[2]}`}>{percentage}%</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Clients</span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Projected GCI</span>
                          <span className="font-medium">${item.gci.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="p-3 rounded-lg bg-background/50 border border-gold/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pipeline</p>
                    <p className="text-xl font-bold text-gold">{pipelineClients.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unique Sources</p>
                    <p className="text-xl font-bold text-foreground">{pipelineSourceArray.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pipeline GCI</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(totalPipelineGCI)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversion Report */}
      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Conversion Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConversionReport />
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
