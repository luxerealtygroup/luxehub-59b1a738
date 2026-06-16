import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Target, DollarSign, TrendingUp, Building2, Edit, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';
import { formatCurrency, formatNumber, formatCurrencyCompact } from '@/lib/utils';

interface CompanyGoal {
  id: string;
  year: number;
  annual_deals_goal: number;
  annual_gci_goal: number;
  annual_volume_goal: number;
  annual_revenue_goal: number;
  monthly_goals: MonthlyGoal[];
  quarterly_deals?: QuarterlyGoal[];
}

interface MonthlyGoal {
  month: number;
  deals: number;
  gci: number;
  volume: number;
  revenue: number;
}

interface QuarterlyGoal {
  quarter: number;
  deals: number;
}

interface TeamActuals {
  closedDeals: number;
  pendingDeals: number;
  totalGci: number;
  pendingGci: number;
  totalVolume: number;
  pendingVolume: number;
  companyRevenue: number;
  pendingRevenue: number;
}

interface AgentGoalSummary {
  agentName: string;
  userId: string;
  units: number;
  gci: number;
  volume: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TeamGoals = () => {
  const { user } = useAuth();
  const currentYear = 2026;
  
  const [goals, setGoals] = useState<CompanyGoal | null>(null);
  const [actuals, setActuals] = useState<TeamActuals | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentGoals, setAgentGoals] = useState<AgentGoalSummary[]>([]);
  
  const [formData, setFormData] = useState({
    annual_deals_goal: 0,
    annual_gci_goal: 0,
    annual_volume_goal: 0,
    annual_revenue_goal: 0,
    average_sale_price: 0,
    average_commission_percent: 3,
  });
  
  const [quarterlyDeals, setQuarterlyDeals] = useState({
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Fetch company goals
    const { data: goalsData } = await supabase
      .from('company_goals')
      .select('*')
      .eq('year', currentYear)
      .maybeSingle();

    if (goalsData) {
      // Parse monthly_goals - could be array (old format) or object with monthly/quarterly (new format)
      const rawMonthlyGoals = goalsData.monthly_goals;
      let monthlyGoals: MonthlyGoal[] = [];
      let quarterlyData: QuarterlyGoal[] | null = null;
      
      if (rawMonthlyGoals && typeof rawMonthlyGoals === 'object') {
        if (Array.isArray(rawMonthlyGoals)) {
          // Old format: direct array
          monthlyGoals = rawMonthlyGoals as unknown as MonthlyGoal[];
        } else if ('monthly' in (rawMonthlyGoals as any)) {
          // New format: { monthly: [...], quarterly: [...] }
          monthlyGoals = ((rawMonthlyGoals as any).monthly || []) as MonthlyGoal[];
          quarterlyData = ((rawMonthlyGoals as any).quarterly || null) as QuarterlyGoal[] | null;
        }
      }
      
      setGoals({
        ...goalsData,
        monthly_goals: monthlyGoals,
        quarterly_deals: quarterlyData || undefined,
      });
      
      const avgSale = goalsData.annual_deals_goal && goalsData.annual_volume_goal 
        ? Math.round(goalsData.annual_volume_goal / goalsData.annual_deals_goal)
        : 0;
      const avgComm = goalsData.annual_volume_goal && goalsData.annual_gci_goal
        ? (goalsData.annual_gci_goal / goalsData.annual_volume_goal) * 100
        : 3;
      setFormData({
        annual_deals_goal: goalsData.annual_deals_goal || 0,
        annual_gci_goal: goalsData.annual_gci_goal || 0,
        annual_volume_goal: goalsData.annual_volume_goal || 0,
        annual_revenue_goal: goalsData.annual_revenue_goal || 0,
        average_sale_price: avgSale,
        average_commission_percent: avgComm,
      });
      
      // Set quarterly deals from stored data or calculate even distribution
      if (quarterlyData && quarterlyData.length === 4) {
        setQuarterlyDeals({
          q1: quarterlyData[0].deals || 0,
          q2: quarterlyData[1].deals || 0,
          q3: quarterlyData[2].deals || 0,
          q4: quarterlyData[3].deals || 0,
        });
      } else if (goalsData.annual_deals_goal) {
        const evenQuarterly = Math.round(goalsData.annual_deals_goal / 4);
        setQuarterlyDeals({
          q1: evenQuarterly,
          q2: evenQuarterly,
          q3: evenQuarterly,
          q4: evenQuarterly,
        });
      }
    }

    // Fetch FUB deals for actuals (same source as AdminDashboard summary)
    let closedDeals = 0;
    let pendingDeals = 0;
    let totalGci = 0;
    let pendingGci = 0;
    let totalVolume = 0;
    let pendingVolume = 0;
    let companyRevenue = 0;
    let pendingRevenue = 0;

    const fubResponse = await followUpBossApi.getDeals(200, 0);
    if (fubResponse.success && fubResponse.data?.deals) {
      const deals = fubResponse.data.deals;
      
      // Closed deals = status is "Won" or similar closed status
      const closedFubDeals = deals.filter((d: FUBDeal) => 
        d.status?.toLowerCase() === 'won' || 
        d.stageName?.toLowerCase().includes('closed') ||
        d.stageName?.toLowerCase().includes('won')
      );
      
      // Pending deals = only deals with stage "Pending"
      const pendingFubDeals = deals.filter((d: FUBDeal) => 
        d.stageName?.toLowerCase() === 'pending'
      );

      closedDeals = closedFubDeals.length;
      pendingDeals = pendingFubDeals.length;

      // Total GCI = full commission value from closed deals
      totalGci = closedFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.commissionValue || 0), 0
      );

      // Pending GCI = full commission value from pending deals
      pendingGci = pendingFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.commissionValue || 0), 0
      );

      // Volume from closed and pending deals
      totalVolume = closedFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.price || 0), 0
      );
      pendingVolume = pendingFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.price || 0), 0
      );

      // Company Revenue = teamCommission from FUB deals (same as AdminDashboard)
      companyRevenue = closedFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.teamCommission || 0), 0
      );
      pendingRevenue = pendingFubDeals.reduce((sum: number, d: FUBDeal) => 
        sum + (d.teamCommission || 0), 0
      );
    }

    setActuals({
      closedDeals,
      pendingDeals,
      totalGci,
      pendingGci,
      totalVolume,
      pendingVolume,
      companyRevenue,
      pendingRevenue,
    });

    // Fetch all agent production goals for gap analysis
    const { data: allAgentGoals } = await supabase
      .from('production_goals')
      .select('user_id, annual_units_goal, annual_gci_goal, annual_volume_goal')
      .eq('year', currentYear);

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name');

    if (allAgentGoals && allProfiles) {
      const profileMap = new Map(allProfiles.map(p => [p.id, p.full_name || 'Unknown']));
      const summaries: AgentGoalSummary[] = allAgentGoals.map(ag => ({
        agentName: profileMap.get(ag.user_id) || 'Unknown',
        userId: ag.user_id,
        units: ag.annual_units_goal || 0,
        gci: ag.annual_gci_goal || 0,
        volume: ag.annual_volume_goal || 0,
      }));
      setAgentGoals(summaries);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Calculate total from quarterly inputs
    const totalQuarterlyDeals = quarterlyDeals.q1 + quarterlyDeals.q2 + quarterlyDeals.q3 + quarterlyDeals.q4;
    const annualDeals = totalQuarterlyDeals > 0 ? totalQuarterlyDeals : formData.annual_deals_goal;
    
    // Recalculate volume and GCI based on quarterly totals
    const annualVolume = annualDeals * formData.average_sale_price;
    const annualGci = Math.round(annualVolume * (formData.average_commission_percent / 100));

    // Generate monthly goals distributed by quarterly seasonality
    const quarterlyDistribution = [
      { deals: quarterlyDeals.q1, months: [0, 1, 2] },   // Q1: Jan, Feb, Mar
      { deals: quarterlyDeals.q2, months: [3, 4, 5] },   // Q2: Apr, May, Jun
      { deals: quarterlyDeals.q3, months: [6, 7, 8] },   // Q3: Jul, Aug, Sep
      { deals: quarterlyDeals.q4, months: [9, 10, 11] }, // Q4: Oct, Nov, Dec
    ];

    const monthlyGoals: MonthlyGoal[] = MONTHS.map((_, index) => {
      // Find which quarter this month belongs to
      const quarterIdx = Math.floor(index / 3);
      const quarterDeals = quarterlyDistribution[quarterIdx].deals;
      const monthlyDeals = Math.round(quarterDeals / 3);
      
      // Calculate proportional GCI, volume, revenue based on deal distribution
      const dealRatio = annualDeals > 0 ? monthlyDeals / annualDeals : 1/12;
      
      return {
        month: index + 1,
        deals: monthlyDeals,
        gci: Math.round(annualGci * dealRatio),
        volume: Math.round(annualVolume * dealRatio),
        revenue: Math.round(formData.annual_revenue_goal * dealRatio),
      };
    });

    // Store quarterly deals for retrieval
    const quarterlyDealsData: QuarterlyGoal[] = [
      { quarter: 1, deals: quarterlyDeals.q1 },
      { quarter: 2, deals: quarterlyDeals.q2 },
      { quarter: 3, deals: quarterlyDeals.q3 },
      { quarter: 4, deals: quarterlyDeals.q4 },
    ];

    const goalData = {
      year: currentYear,
      annual_deals_goal: annualDeals,
      annual_gci_goal: annualGci,
      annual_volume_goal: annualVolume,
      annual_revenue_goal: formData.annual_revenue_goal,
      monthly_goals: JSON.parse(JSON.stringify({ monthly: monthlyGoals, quarterly: quarterlyDealsData })),
      created_by: user.id,
    };

    if (goals?.id) {
      const { error } = await supabase
        .from('company_goals')
        .update(goalData)
        .eq('id', goals.id);
      
      if (error) {
        toast.error('Failed to update goals');
        console.error(error);
      } else {
        toast.success('Goals updated');
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('company_goals')
        .insert(goalData);
      
      if (error) {
        toast.error('Failed to save goals');
        console.error(error);
      } else {
        toast.success('Goals saved');
        fetchData();
      }
    }

    setSaving(false);
    setDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const totalDeals = (actuals?.closedDeals || 0) + (actuals?.pendingDeals || 0);
  const dealsProgress = goals?.annual_deals_goal ? (totalDeals / goals.annual_deals_goal) * 100 : 0;
  const totalGci = (actuals?.totalGci || 0) + (actuals?.pendingGci || 0);
  const gciProgress = goals?.annual_gci_goal ? (totalGci / goals.annual_gci_goal) * 100 : 0;
  const totalVolume = (actuals?.totalVolume || 0) + (actuals?.pendingVolume || 0);
  const volumeProgress = goals?.annual_volume_goal ? (totalVolume / goals.annual_volume_goal) * 100 : 0;
  const totalRevenue = (actuals?.companyRevenue || 0) + (actuals?.pendingRevenue || 0);
  const revenueProgress = goals?.annual_revenue_goal ? (totalRevenue / goals.annual_revenue_goal) * 100 : 0;

  // Build chart data for goal vs actual by month
  const currentMonth = new Date().getMonth();
  const monthlyChartData = MONTHS.map((month, index) => {
    const monthlyGoal = goals?.monthly_goals?.[index];
    const isPast = index <= currentMonth;
    
    return {
      month,
      goalGci: monthlyGoal?.gci || (goals?.annual_gci_goal ? Math.round(goals.annual_gci_goal / 12) : 0),
      goalRevenue: monthlyGoal?.revenue || (goals?.annual_revenue_goal ? Math.round(goals.annual_revenue_goal / 12) : 0),
      // For simplicity, we'll show YTD actuals distributed to current month only
      actualGci: index === currentMonth ? (actuals?.totalGci || 0) + (actuals?.pendingGci || 0) : 0,
      actualRevenue: index === currentMonth ? (actuals?.companyRevenue || 0) : 0,
    };
  });

  return (
    <Card className="border-gold/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-gold font-display flex items-center gap-2">
          <Target className="h-5 w-5" /> Team Goals {currentYear}
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="border-gold/30 text-gold hover:bg-gold/10">
              <Edit className="h-4 w-4 mr-2" />
              {goals ? 'Edit Goals' : 'Set Goals'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Team Goals for {currentYear}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Average Sale Price ($)</Label>
                  <Input
                    type="number"
                    value={formData.average_sale_price}
                    onChange={(e) => {
                      const avgSale = parseInt(e.target.value) || 0;
                      const volume = avgSale * formData.annual_deals_goal;
                      const gci = Math.round(volume * (formData.average_commission_percent / 100));
                      setFormData({ 
                        ...formData, 
                        average_sale_price: avgSale,
                        annual_volume_goal: volume,
                        annual_gci_goal: gci,
                      });
                    }}
                    placeholder="e.g., 350000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avg Commission (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.average_commission_percent}
                    onChange={(e) => {
                      const avgComm = parseFloat(e.target.value) || 0;
                      const gci = Math.round(formData.annual_volume_goal * (avgComm / 100));
                      setFormData({ 
                        ...formData, 
                        average_commission_percent: avgComm,
                        annual_gci_goal: gci,
                      });
                    }}
                    placeholder="e.g., 3"
                  />
                </div>
              </div>
              {/* Quarterly Deal Goals for Seasonality */}
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                <Label className="text-sm font-medium">Quarterly Deal Goals <span className="text-xs text-muted-foreground">(set for seasonality)</span></Label>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Q1 (Jan-Mar)</Label>
                    <Input
                      type="number"
                      value={quarterlyDeals.q1}
                      onChange={(e) => {
                        const q1 = parseInt(e.target.value) || 0;
                        const total = q1 + quarterlyDeals.q2 + quarterlyDeals.q3 + quarterlyDeals.q4;
                        const volume = total * formData.average_sale_price;
                        const gci = Math.round(volume * (formData.average_commission_percent / 100));
                        setQuarterlyDeals({ ...quarterlyDeals, q1 });
                        setFormData({ ...formData, annual_deals_goal: total, annual_volume_goal: volume, annual_gci_goal: gci });
                      }}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Q2 (Apr-Jun)</Label>
                    <Input
                      type="number"
                      value={quarterlyDeals.q2}
                      onChange={(e) => {
                        const q2 = parseInt(e.target.value) || 0;
                        const total = quarterlyDeals.q1 + q2 + quarterlyDeals.q3 + quarterlyDeals.q4;
                        const volume = total * formData.average_sale_price;
                        const gci = Math.round(volume * (formData.average_commission_percent / 100));
                        setQuarterlyDeals({ ...quarterlyDeals, q2 });
                        setFormData({ ...formData, annual_deals_goal: total, annual_volume_goal: volume, annual_gci_goal: gci });
                      }}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Q3 (Jul-Sep)</Label>
                    <Input
                      type="number"
                      value={quarterlyDeals.q3}
                      onChange={(e) => {
                        const q3 = parseInt(e.target.value) || 0;
                        const total = quarterlyDeals.q1 + quarterlyDeals.q2 + q3 + quarterlyDeals.q4;
                        const volume = total * formData.average_sale_price;
                        const gci = Math.round(volume * (formData.average_commission_percent / 100));
                        setQuarterlyDeals({ ...quarterlyDeals, q3 });
                        setFormData({ ...formData, annual_deals_goal: total, annual_volume_goal: volume, annual_gci_goal: gci });
                      }}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Q4 (Oct-Dec)</Label>
                    <Input
                      type="number"
                      value={quarterlyDeals.q4}
                      onChange={(e) => {
                        const q4 = parseInt(e.target.value) || 0;
                        const total = quarterlyDeals.q1 + quarterlyDeals.q2 + quarterlyDeals.q3 + q4;
                        const volume = total * formData.average_sale_price;
                        const gci = Math.round(volume * (formData.average_commission_percent / 100));
                        setQuarterlyDeals({ ...quarterlyDeals, q4 });
                        setFormData({ ...formData, annual_deals_goal: total, annual_volume_goal: volume, annual_gci_goal: gci });
                      }}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {quarterlyDeals.q1 + quarterlyDeals.q2 + quarterlyDeals.q3 + quarterlyDeals.q4} deals/year
                </p>
              </div>

              <div className="space-y-2">
                <Label>Annual Volume Goal ($) <span className="text-xs text-muted-foreground">(auto-calculated from deals × avg price)</span></Label>
                <Input
                  type="number"
                  value={formData.annual_volume_goal}
                  onChange={(e) => {
                    const volume = parseInt(e.target.value) || 0;
                    const gci = Math.round(volume * (formData.average_commission_percent / 100));
                    setFormData({ ...formData, annual_volume_goal: volume, annual_gci_goal: gci });
                  }}
                  placeholder="e.g., 15000000"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Annual GCI Goal ($) <span className="text-xs text-muted-foreground">(auto-calculated)</span></Label>
                <Input
                  type="number"
                  value={formData.annual_gci_goal}
                  onChange={(e) => setFormData({ ...formData, annual_gci_goal: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 500000"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Annual Company Revenue Goal ($)</Label>
                <Input
                  type="number"
                  value={formData.annual_revenue_goal}
                  onChange={(e) => setFormData({ ...formData, annual_revenue_goal: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 150000"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full bg-gold hover:bg-gold/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Goals
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gold" />
              <span className="text-sm font-medium">Sales</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{actuals?.closedDeals || 0} closed + {actuals?.pendingDeals || 0} pending / {goals?.annual_deals_goal || 0}</span>
              <span>{Math.round(dealsProgress)}%</span>
            </div>
            <Progress value={Math.min(dealsProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Gross GCI</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatCurrency(totalGci)} / {formatCurrency(goals?.annual_gci_goal)}</span>
              <span>{Math.round(gciProgress)}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(actuals?.totalGci)} paid + {formatCurrency(actuals?.pendingGci)} pending
            </div>
            <Progress value={Math.min(gciProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Volume</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatCurrency(totalVolume)} / {formatCurrency(goals?.annual_volume_goal)}</span>
              <span>{Math.round(volumeProgress)}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(actuals?.totalVolume)} closed + {formatCurrency(actuals?.pendingVolume)} pending
            </div>
            <Progress value={Math.min(volumeProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Company Revenue</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatCurrency(totalRevenue)} / {formatCurrency(goals?.annual_revenue_goal)}</span>
              <span>{Math.round(revenueProgress)}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(actuals?.companyRevenue)} closed + {formatCurrency(actuals?.pendingRevenue)} pending
            </div>
          </div>
        </div>

        {/* Company vs Agent Goals Gap Analysis */}
        {goals && agentGoals.length > 0 && (
          <div className="pt-4 space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Company Goal vs Agent Goals Gap</h4>
            {(() => {
              const totalAgentUnits = agentGoals.reduce((s, a) => s + a.units, 0);
              const totalAgentGci = agentGoals.reduce((s, a) => s + a.gci, 0);
              const totalAgentVolume = agentGoals.reduce((s, a) => s + a.volume, 0);
              const unitsGap = (goals.annual_deals_goal || 0) - totalAgentUnits;
              const gciGap = (goals.annual_gci_goal || 0) - totalAgentGci;
              const volumeGap = (goals.annual_volume_goal || 0) - totalAgentVolume;

              return (
                <>
                  {/* Summary gap cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <p className="text-xs text-muted-foreground">Units Gap</p>
                      <p className={`text-xl font-bold ${unitsGap > 0 ? 'text-destructive' : 'text-green-500'}`}>
                        {unitsGap > 0 ? `-${unitsGap}` : `+${Math.abs(unitsGap)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalAgentUnits} of {goals.annual_deals_goal || 0} assigned
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <p className="text-xs text-muted-foreground">GCI Gap</p>
                      <p className={`text-xl font-bold ${gciGap > 0 ? 'text-destructive' : 'text-green-500'}`}>
                        {gciGap > 0 ? `-${formatCurrency(gciGap)}` : `+${formatCurrency(Math.abs(gciGap))}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(totalAgentGci)} of {formatCurrency(goals.annual_gci_goal)} assigned
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <p className="text-xs text-muted-foreground">Volume Gap</p>
                      <p className={`text-xl font-bold ${volumeGap > 0 ? 'text-destructive' : 'text-green-500'}`}>
                        {volumeGap > 0 ? `-${formatCurrency(volumeGap)}` : `+${formatCurrency(Math.abs(volumeGap))}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(totalAgentVolume)} of {formatCurrency(goals.annual_volume_goal)} assigned
                      </p>
                    </div>
                  </div>

                  {/* Per-agent breakdown */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">Units Goal</TableHead>
                          <TableHead className="text-right">GCI Goal</TableHead>
                          <TableHead className="text-right">Volume Goal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentGoals.map(ag => (
                          <TableRow key={ag.userId}>
                            <TableCell className="font-medium">{ag.agentName}</TableCell>
                            <TableCell className="text-right">{ag.units}</TableCell>
                            <TableCell className="text-right">{formatCurrency(ag.gci)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(ag.volume)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-border font-bold">
                          <TableCell>Total Assigned</TableCell>
                          <TableCell className="text-right">{totalAgentUnits}</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalAgentGci)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalAgentVolume)}</TableCell>
                        </TableRow>
                        <TableRow className="font-bold text-gold">
                          <TableCell>Company Goal</TableCell>
                          <TableCell className="text-right">{goals.annual_deals_goal || 0}</TableCell>
                          <TableCell className="text-right">{formatCurrency(goals.annual_gci_goal)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(goals.annual_volume_goal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {goals && (
          <div className="pt-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-4">Monthly Goal Breakdown</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), '']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Legend />
                  <Bar dataKey="goalGci" name="GCI Goal" fill="hsl(43 74% 49% / 0.3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="goalRevenue" name="Revenue Goal" fill="hsl(217 91% 60% / 0.3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {!goals && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No team goals set for {currentYear}.</p>
            <p className="text-sm mt-1">Click "Set Goals" to create annual targets.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamGoals;
