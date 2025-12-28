import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, TrendingUp, DollarSign, Home, Edit2, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AnnualGoals {
  id?: string;
  deals_goal: number;
  gci_goal: number;
}

interface ActualMetrics {
  deals_closed: number;
  deals_pending: number;
  gci_earned: number;
  gci_pending: number;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quarterNames = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];

const Goals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [breakdownView, setBreakdownView] = useState<'monthly' | 'quarterly'>('monthly');
  
  const [annualGoals, setAnnualGoals] = useState<AnnualGoals>({
    deals_goal: 0,
    gci_goal: 0
  });
  
  const [actualMetrics, setActualMetrics] = useState<ActualMetrics>({
    deals_closed: 0,
    deals_pending: 0,
    gci_earned: 0,
    gci_pending: 0
  });
  
  const [formData, setFormData] = useState({
    deals_goal: '',
    gci_goal: ''
  });

  const currentYear = 2026;

  const fetchAnnualGoals = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('agent_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    if (data && data.length > 0) {
      const dealsGoal = data.find(g => g.goal_type === 'deals_closed');
      const gciGoal = data.find(g => g.goal_type === 'revenue');
      
      setAnnualGoals({
        id: dealsGoal?.id || gciGoal?.id,
        deals_goal: dealsGoal?.target_value || 0,
        gci_goal: gciGoal?.target_value || 0
      });
      
      setFormData({
        deals_goal: dealsGoal?.target_value?.toString() || '',
        gci_goal: gciGoal?.target_value?.toString() || ''
      });
    }
  };

  const fetchActualMetrics = async () => {
    if (!user) return;
    
    // Fetch closed deals
    const { data: closedDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', user.id)
      .eq('stage', 'closed');
    
    // Fetch pending deals
    const { data: pendingDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', user.id)
      .in('stage', ['under_contract', 'offer']);
    
    // Fetch paid commissions
    const { data: paidCommissions } = await supabase
      .from('commissions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('status', 'paid');
    
    // Fetch pending commissions
    const { data: pendingCommissions } = await supabase
      .from('commissions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('status', 'pending');
    
    setActualMetrics({
      deals_closed: closedDeals?.length || 0,
      deals_pending: pendingDeals?.length || 0,
      gci_earned: paidCommissions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0,
      gci_pending: pendingCommissions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0
    });
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnualGoals();
    fetchActualMetrics();
  }, [user]);

  const handleSaveGoals = async () => {
    if (!user) return;
    
    const dealsTarget = parseFloat(formData.deals_goal) || 0;
    const gciTarget = parseFloat(formData.gci_goal) || 0;
    
    // Check if goals already exist
    const { data: existingGoals } = await supabase
      .from('agent_goals')
      .select('id, goal_type')
      .eq('user_id', user.id)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    const existingDealsGoal = existingGoals?.find(g => g.goal_type === 'deals_closed');
    const existingGciGoal = existingGoals?.find(g => g.goal_type === 'revenue');
    
    // Upsert deals goal
    if (existingDealsGoal) {
      await supabase
        .from('agent_goals')
        .update({ target_value: dealsTarget })
        .eq('id', existingDealsGoal.id);
    } else {
      await supabase.from('agent_goals').insert({
        user_id: user.id,
        goal_type: 'deals_closed',
        target_value: dealsTarget,
        current_value: actualMetrics.deals_closed,
        period: 'yearly',
        category: 'business'
      });
    }
    
    // Upsert GCI goal
    if (existingGciGoal) {
      await supabase
        .from('agent_goals')
        .update({ target_value: gciTarget })
        .eq('id', existingGciGoal.id);
    } else {
      await supabase.from('agent_goals').insert({
        user_id: user.id,
        goal_type: 'revenue',
        target_value: gciTarget,
        current_value: actualMetrics.gci_earned,
        period: 'yearly',
        category: 'business'
      });
    }
    
    setAnnualGoals({ deals_goal: dealsTarget, gci_goal: gciTarget });
    setShowSetup(false);
    toast({ title: 'Annual goals saved!' });
    fetchAnnualGoals();
  };

  const hasGoalsSet = annualGoals.deals_goal > 0 || annualGoals.gci_goal > 0;
  
  const dealsProgress = annualGoals.deals_goal > 0 
    ? Math.min(100, Math.round((actualMetrics.deals_closed / annualGoals.deals_goal) * 100))
    : 0;
  
  const gciProgress = annualGoals.gci_goal > 0 
    ? Math.min(100, Math.round((actualMetrics.gci_earned / annualGoals.gci_goal) * 100))
    : 0;

  const totalDeals = actualMetrics.deals_closed + actualMetrics.deals_pending;
  const totalGci = actualMetrics.gci_earned + actualMetrics.gci_pending;

  // Calculate monthly and quarterly breakdowns
  const monthlyDealsGoal = annualGoals.deals_goal / 12;
  const monthlyGciGoal = annualGoals.gci_goal / 12;
  const quarterlyDealsGoal = annualGoals.deals_goal / 4;
  const quarterlyGciGoal = annualGoals.gci_goal / 4;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">{currentYear} Goals</h1>
          <p className="text-muted-foreground mt-1">Track your annual targets</p>
        </div>
        <Button 
          variant="outline" 
          className="border-gold/30 text-gold hover:bg-gold/10"
          onClick={() => setShowSetup(true)}
        >
          <Edit2 className="h-4 w-4 mr-2" /> {hasGoalsSet ? 'Edit Goals' : 'Set Goals'}
        </Button>
      </div>

      {/* Goal Setup Dialog */}
      <Dialog open={showSetup || !hasGoalsSet} onOpenChange={setShowSetup}>
        <DialogContent className="border-gold/20 bg-card">
          <DialogHeader>
            <DialogTitle className="text-gold font-display text-xl">Set Your {currentYear} Goals</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Annual Deals Goal</Label>
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-gold" />
                <Input
                  type="number"
                  placeholder="e.g., 24"
                  value={formData.deals_goal}
                  onChange={(e) => setFormData({ ...formData, deals_goal: e.target.value })}
                  className="text-lg"
                />
                <span className="text-muted-foreground">deals</span>
              </div>
              <p className="text-xs text-muted-foreground">How many deals do you want to close this year?</p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-foreground">Annual GCI Goal</Label>
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-gold" />
                <Input
                  type="number"
                  placeholder="e.g., 150000"
                  value={formData.gci_goal}
                  onChange={(e) => setFormData({ ...formData, gci_goal: e.target.value })}
                  className="text-lg"
                />
              </div>
              <p className="text-xs text-muted-foreground">What's your target gross commission income?</p>
            </div>
            
            <Button 
              onClick={handleSaveGoals} 
              className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
              disabled={!formData.deals_goal && !formData.gci_goal}
            >
              Save Goals
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Dashboard */}
      {hasGoalsSet && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Deals Progress */}
            <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                    <Home className="h-5 w-5 text-gold" />
                    Deals Closed
                  </CardTitle>
                  <span className={`text-2xl font-bold ${dealsProgress >= 100 ? 'text-green-400' : 'text-gold'}`}>
                    {dealsProgress}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={dealsProgress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-3xl font-bold text-foreground">{actualMetrics.deals_closed}</span>
                    <span className="text-muted-foreground ml-2">/ {annualGoals.deals_goal} goal</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+{actualMetrics.deals_pending} pending</p>
                    <p className="text-xs text-muted-foreground">{totalDeals} total pipeline</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {annualGoals.deals_goal - actualMetrics.deals_closed > 0 
                    ? `${annualGoals.deals_goal - actualMetrics.deals_closed} more deals to reach your goal`
                    : '🎉 Goal achieved!'}
                </div>
              </CardContent>
            </Card>

            {/* GCI Progress */}
            <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-gold" />
                    GCI (Commission)
                  </CardTitle>
                  <span className={`text-2xl font-bold ${gciProgress >= 100 ? 'text-green-400' : 'text-gold'}`}>
                    {gciProgress}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={gciProgress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-3xl font-bold text-foreground">${actualMetrics.gci_earned.toLocaleString()}</span>
                    <span className="text-muted-foreground ml-2">/ ${annualGoals.gci_goal.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+${actualMetrics.gci_pending.toLocaleString()} pending</p>
                    <p className="text-xs text-muted-foreground">${totalGci.toLocaleString()} total</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {annualGoals.gci_goal - actualMetrics.gci_earned > 0 
                    ? `$${(annualGoals.gci_goal - actualMetrics.gci_earned).toLocaleString()} more to reach your goal`
                    : '🎉 Goal achieved!'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Goal Breakdown Section */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gold" />
                  Goal Breakdown
                </CardTitle>
                <Select value={breakdownView} onValueChange={(v: 'monthly' | 'quarterly') => setBreakdownView(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {breakdownView === 'monthly' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {monthNames.map((month, index) => (
                    <div key={month} className="p-3 rounded-lg bg-background/50 border border-primary/10">
                      <p className="text-sm font-medium text-foreground mb-2">{month}</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Home className="h-3 w-3 text-gold" />
                          <span className="text-xs text-muted-foreground">Deals:</span>
                          <span className="text-xs font-medium text-gold">{monthlyDealsGoal.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-green-400" />
                          <span className="text-xs text-muted-foreground">GCI:</span>
                          <span className="text-xs font-medium text-green-400">${Math.round(monthlyGciGoal).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {quarterNames.map((quarter, index) => (
                    <div key={quarter} className="p-4 rounded-lg bg-background/50 border border-primary/10">
                      <p className="text-sm font-medium text-foreground mb-3">{quarter}</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Home className="h-4 w-4 text-gold" />
                            <span className="text-sm text-muted-foreground">Deals</span>
                          </div>
                          <span className="text-lg font-bold text-gold">{quarterlyDealsGoal.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-green-400" />
                            <span className="text-sm text-muted-foreground">GCI</span>
                          </div>
                          <span className="text-lg font-bold text-green-400">${Math.round(quarterlyGciGoal).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Based on your annual goal of {annualGoals.deals_goal} deals and ${annualGoals.gci_goal.toLocaleString()} GCI
              </p>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Target className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Closed</p>
                    <p className="text-xl font-bold text-green-400">{actualMetrics.deals_closed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <TrendingUp className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold text-amber-400">{actualMetrics.deals_pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <DollarSign className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Earned</p>
                    <p className="text-xl font-bold text-green-400">${actualMetrics.gci_earned.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-gold/10 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <DollarSign className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending GCI</p>
                    <p className="text-xl font-bold text-amber-400">${actualMetrics.gci_pending.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Goals;
