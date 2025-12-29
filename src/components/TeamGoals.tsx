import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Target, DollarSign, TrendingUp, Building2, Edit, Loader2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { toast } from 'sonner';

interface CompanyGoal {
  id: string;
  year: number;
  annual_deals_goal: number;
  annual_gci_goal: number;
  annual_volume_goal: number;
  annual_revenue_goal: number;
  monthly_goals: MonthlyGoal[];
}

interface MonthlyGoal {
  month: number;
  deals: number;
  gci: number;
  volume: number;
  revenue: number;
}

interface TeamActuals {
  closedDeals: number;
  totalGci: number;
  pendingGci: number;
  totalVolume: number;
  companyRevenue: number;
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
  
  const [formData, setFormData] = useState({
    annual_deals_goal: 0,
    annual_gci_goal: 0,
    annual_volume_goal: 0,
    annual_revenue_goal: 0,
    average_sale_price: 0,
    average_commission_percent: 3,
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
      const monthlyGoals = Array.isArray(goalsData.monthly_goals) 
        ? (goalsData.monthly_goals as unknown as MonthlyGoal[])
        : [];
      setGoals({
        ...goalsData,
        monthly_goals: monthlyGoals,
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
    }

    // Fetch team actuals from deals and commissions
    const { data: deals } = await supabase
      .from('deals')
      .select('*');

    const { data: commissions } = await supabase
      .from('commissions')
      .select('*');

    const closedDeals = (deals || []).filter(d => d.stage === 'closed').length;
    const totalVolume = (deals || []).filter(d => d.stage === 'closed')
      .reduce((sum, d) => sum + Number(d.deal_value || 0), 0);
    
    const totalGci = (commissions || []).filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);
    const pendingGci = (commissions || []).filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

    // Calculate company revenue (team split)
    const companyRevenue = (deals || []).filter(d => d.stage === 'closed')
      .reduce((sum, d) => {
        const dealValue = Number(d.deal_value || 0);
        const commissionRate = Number(d.commission_rate || 3) / 100;
        const companySplit = Number(d.company_split_percentage || 30) / 100;
        return sum + (dealValue * commissionRate * companySplit);
      }, 0);

    setActuals({
      closedDeals,
      totalGci,
      pendingGci,
      totalVolume,
      companyRevenue,
    });

    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Generate monthly goals (evenly distributed)
    const monthlyGoals: MonthlyGoal[] = MONTHS.map((_, index) => ({
      month: index + 1,
      deals: Math.round(formData.annual_deals_goal / 12),
      gci: Math.round(formData.annual_gci_goal / 12),
      volume: Math.round(formData.annual_volume_goal / 12),
      revenue: Math.round(formData.annual_revenue_goal / 12),
    }));

    const goalData = {
      year: currentYear,
      annual_deals_goal: formData.annual_deals_goal,
      annual_gci_goal: formData.annual_gci_goal,
      annual_volume_goal: formData.annual_volume_goal,
      annual_revenue_goal: formData.annual_revenue_goal,
      monthly_goals: JSON.parse(JSON.stringify(monthlyGoals)),
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

  const dealsProgress = goals?.annual_deals_goal ? ((actuals?.closedDeals || 0) / goals.annual_deals_goal) * 100 : 0;
  const gciProgress = goals?.annual_gci_goal ? (((actuals?.totalGci || 0) + (actuals?.pendingGci || 0)) / goals.annual_gci_goal) * 100 : 0;
  const volumeProgress = goals?.annual_volume_goal ? ((actuals?.totalVolume || 0) / goals.annual_volume_goal) * 100 : 0;
  const revenueProgress = goals?.annual_revenue_goal ? ((actuals?.companyRevenue || 0) / goals.annual_revenue_goal) * 100 : 0;

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
              <div className="space-y-2">
                <Label>Annual Deals Goal</Label>
                <Input
                  type="number"
                  value={formData.annual_deals_goal}
                  onChange={(e) => {
                    const deals = parseInt(e.target.value) || 0;
                    const volume = deals * formData.average_sale_price;
                    const gci = Math.round(volume * (formData.average_commission_percent / 100));
                    setFormData({ 
                      ...formData, 
                      annual_deals_goal: deals,
                      annual_volume_goal: volume,
                      annual_gci_goal: gci,
                    });
                  }}
                  placeholder="e.g., 50"
                />
              </div>
              <div className="space-y-2">
                <Label>Annual Volume Goal ($) <span className="text-xs text-muted-foreground">(auto-calculated)</span></Label>
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
              <span className="text-sm font-medium">Deals</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{actuals?.closedDeals || 0} / {goals?.annual_deals_goal || 0}</span>
              <span>{Math.round(dealsProgress)}%</span>
            </div>
            <Progress value={Math.min(dealsProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">GCI</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>${((actuals?.totalGci || 0) + (actuals?.pendingGci || 0)).toLocaleString()} / ${(goals?.annual_gci_goal || 0).toLocaleString()}</span>
              <span>{Math.round(gciProgress)}%</span>
            </div>
            <Progress value={Math.min(gciProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Volume</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>${(actuals?.totalVolume || 0).toLocaleString()} / ${(goals?.annual_volume_goal || 0).toLocaleString()}</span>
              <span>{Math.round(volumeProgress)}%</span>
            </div>
            <Progress value={Math.min(volumeProgress, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Company Revenue</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>${(actuals?.companyRevenue || 0).toLocaleString()} / ${(goals?.annual_revenue_goal || 0).toLocaleString()}</span>
              <span>{Math.round(revenueProgress)}%</span>
            </div>
            <Progress value={Math.min(revenueProgress, 100)} className="h-2" />
          </div>
        </div>

        {/* Monthly Breakdown Chart */}
        {goals && (
          <div className="pt-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-4">Monthly Goal Breakdown</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
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
