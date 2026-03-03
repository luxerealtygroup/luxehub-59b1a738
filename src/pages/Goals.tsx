import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, TrendingUp, DollarSign, Home, Edit2, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface AnnualGoals {
  id?: string;
  deals_goal: number;
  gci_goal: number;
  avg_sale_price: number;
  commission_rate: number;
  split_percent: number;
  fallout_rate: number;
}

interface ActualMetrics {
  deals_closed: number;
  deals_pending: number;
  gci_earned: number;
  gci_pending: number;
}

interface MonthlyGoal {
  deals: number;
  gci: number;
  focus?: string;
  target?: string;
}

interface FourOneOneMonthlyGoal {
  month: number;
  focus: string;
  target: string;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quarterNames = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];

const createDefaultMonthlyGoals = (dealsGoal: number, gciGoal: number): MonthlyGoal[] => {
  return monthNames.map(() => ({
    deals: dealsGoal / 12,
    gci: gciGoal / 12,
    focus: '',
    target: ''
  }));
};

const Goals = () => {
  const { user } = useAuth();
  const { isViewingAsAgent, effectiveUserId, viewingAgentName } = useViewAsAgent();
  const { toast } = useToast();
  const isReadOnly = isViewingAsAgent; // Admin viewing as agent = read-only
  const queryUserId = effectiveUserId; // Use effective user for all READ queries
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [breakdownView, setBreakdownView] = useState<'monthly' | 'quarterly'>('monthly');
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editingQuarter, setEditingQuarter] = useState<number | null>(null);
  
  const [annualGoals, setAnnualGoals] = useState<AnnualGoals>({
    deals_goal: 0,
    gci_goal: 0,
    avg_sale_price: 350000,
    commission_rate: 3,
    split_percent: 70,
    fallout_rate: 50
  });
  
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoal[]>(
    createDefaultMonthlyGoals(0, 0)
  );
  
  const [actualMetrics, setActualMetrics] = useState<ActualMetrics>({
    deals_closed: 0,
    deals_pending: 0,
    gci_earned: 0,
    gci_pending: 0
  });
  
  const [formData, setFormData] = useState({
    deals_goal: '',
    gci_goal: '',
    avg_sale_price: '350000',
    commission_rate: '3',
    split_percent: '70',
    fallout_rate: '50'
  });

  const currentYear = 2026;

  const fetchAnnualGoals = async () => {
    if (!queryUserId) return;
    
    const { data } = await supabase
      .from('agent_goals')
      .select('*')
      .eq('user_id', queryUserId)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    // Also fetch 411 monthly goals from production_goals
    const { data: productionData } = await supabase
      .from('production_goals')
      .select('monthly_goals')
      .eq('user_id', queryUserId)
      .eq('year', currentYear)
      .maybeSingle();
    
    const fourOneOneGoals: FourOneOneMonthlyGoal[] = (productionData?.monthly_goals as unknown as FourOneOneMonthlyGoal[]) || [];
    
    if (data && data.length > 0) {
      const dealsGoal = data.find(g => g.goal_type === 'deals_closed');
      const gciGoal = data.find(g => g.goal_type === 'revenue');
      
      const dealsValue = dealsGoal?.target_value || 0;
      const gciValue = gciGoal?.target_value || 0;
      
      // Load saved calculation values from localStorage
      const savedCalcValues = localStorage.getItem(`goalCalcValues_${queryUserId}_${currentYear}`);
      const calcValues = savedCalcValues ? JSON.parse(savedCalcValues) : {
        avg_sale_price: 350000,
        commission_rate: 3,
        split_percent: 70,
        fallout_rate: 50
      };
      
      setAnnualGoals({
        id: dealsGoal?.id || gciGoal?.id,
        deals_goal: dealsValue,
        gci_goal: gciValue,
        avg_sale_price: calcValues.avg_sale_price,
        commission_rate: calcValues.commission_rate,
        split_percent: calcValues.split_percent,
        fallout_rate: calcValues.fallout_rate ?? 50
      });
      
      setFormData({
        deals_goal: dealsValue?.toString() || '',
        gci_goal: gciValue?.toString() || '',
        avg_sale_price: calcValues.avg_sale_price.toString(),
        commission_rate: calcValues.commission_rate.toString(),
        split_percent: calcValues.split_percent.toString(),
        fallout_rate: (calcValues.fallout_rate ?? 50).toString()
      });
      
      // Initialize monthly goals - check if saved in localStorage
      const savedMonthlyGoals = localStorage.getItem(`monthlyGoals_${queryUserId}_${currentYear}`);
      if (savedMonthlyGoals) {
        const parsed = JSON.parse(savedMonthlyGoals);
        // Merge with 411 goals
        const merged = parsed.map((goal: MonthlyGoal, idx: number) => {
          const fourOneOneGoal = fourOneOneGoals.find(g => g.month === idx);
          return {
            ...goal,
            focus: fourOneOneGoal?.focus || goal.focus || '',
            target: fourOneOneGoal?.target || goal.target || ''
          };
        });
        setMonthlyGoals(merged);
      } else {
        const defaultGoals = createDefaultMonthlyGoals(dealsValue, gciValue);
        // Merge with 411 goals
        const merged = defaultGoals.map((goal, idx) => {
          const fourOneOneGoal = fourOneOneGoals.find(g => g.month === idx);
          return {
            ...goal,
            focus: fourOneOneGoal?.focus || '',
            target: fourOneOneGoal?.target || ''
          };
        });
        setMonthlyGoals(merged);
      }
    } else {
      // No annual goals set yet, but still load 411 monthly goals
      const defaultGoals = createDefaultMonthlyGoals(0, 0);
      const merged = defaultGoals.map((goal, idx) => {
        const fourOneOneGoal = fourOneOneGoals.find(g => g.month === idx);
        return {
          ...goal,
          focus: fourOneOneGoal?.focus || '',
          target: fourOneOneGoal?.target || ''
        };
      });
      setMonthlyGoals(merged);
    }
  };

  const fetchActualMetrics = async () => {
    if (!queryUserId) return;
    
    // Fetch closed deals
    const { data: closedDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', queryUserId)
      .eq('stage', 'closed');
    
    // Fetch pending deals
    const { data: pendingDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('user_id', queryUserId)
      .in('stage', ['under_contract', 'offer']);
    
    // Fetch paid commissions (use gross_commission with fallback to amount, matching Dashboard)
    const { data: paidCommissions } = await supabase
      .from('commissions')
      .select('gross_commission, amount')
      .eq('user_id', queryUserId)
      .eq('status', 'paid');
    
    // Fetch pending commissions (use gross_commission with fallback to amount, matching Dashboard)
    const { data: pendingCommissions } = await supabase
      .from('commissions')
      .select('gross_commission, amount')
      .eq('user_id', queryUserId)
      .eq('status', 'pending');
    
    setActualMetrics({
      deals_closed: closedDeals?.length || 0,
      deals_pending: pendingDeals?.length || 0,
      gci_earned: paidCommissions?.reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0) || 0,
      gci_pending: pendingCommissions?.reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0) || 0
    });
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnualGoals();
    fetchActualMetrics();
  }, [queryUserId]);

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
    
    const avgPrice = parseFloat(formData.avg_sale_price) || 350000;
    const commRate = parseFloat(formData.commission_rate) || 3;
    const splitPct = parseFloat(formData.split_percent) || 70;
    const falloutRate = parseFloat(formData.fallout_rate) || 50;
    
    // Save calculation values to localStorage
    if (user) {
      localStorage.setItem(`goalCalcValues_${user.id}_${currentYear}`, JSON.stringify({
        avg_sale_price: avgPrice,
        commission_rate: commRate,
        split_percent: splitPct,
        fallout_rate: falloutRate
      }));
    }
    
    setAnnualGoals({ 
      deals_goal: dealsTarget, 
      gci_goal: gciTarget,
      avg_sale_price: avgPrice,
      commission_rate: commRate,
      split_percent: splitPct,
      fallout_rate: falloutRate
    });
    setShowSetup(false);
    toast({ title: 'Annual goals saved!' });
    fetchAnnualGoals();
  };

  const hasGoalsSet = annualGoals.deals_goal > 0 || annualGoals.gci_goal > 0 || monthlyGoals.some(m => m.deals > 0 || m.gci > 0);
  
  // Calculate totals from monthly breakdown (these are the "real" goals after editing)
  const totalDealsGoal = monthlyGoals.reduce((sum, m) => sum + (m.deals || 0), 0);
  const totalGciGoal = monthlyGoals.reduce((sum, m) => sum + (m.gci || 0), 0);
  
  const dealsProgress = totalDealsGoal > 0 
    ? Math.min(100, Math.round((actualMetrics.deals_closed / totalDealsGoal) * 100))
    : 0;
  
  const gciProgress = totalGciGoal > 0 
    ? Math.min(100, Math.round((actualMetrics.gci_earned / totalGciGoal) * 100))
    : 0;

  const totalDeals = actualMetrics.deals_closed + actualMetrics.deals_pending;
  const totalGci = actualMetrics.gci_earned + actualMetrics.gci_pending;

  // Calculate quarterly breakdowns from monthly goals
  const getQuarterlyGoals = (quarterIndex: number) => {
    const startMonth = quarterIndex * 3;
    const quarterMonths = monthlyGoals.slice(startMonth, startMonth + 3);
    // Collect 411 goals for this quarter
    const quarterFocuses = quarterMonths
      .map((m, idx) => ({ month: monthNames[startMonth + idx], focus: m.focus, target: m.target }))
      .filter(m => m.focus || m.target);
    return {
      deals: quarterMonths.reduce((sum, m) => sum + m.deals, 0),
      gci: quarterMonths.reduce((sum, m) => sum + m.gci, 0),
      fourOneOneGoals: quarterFocuses
    };
  };

  // Calculate GCI from deals using saved rates
  const calculateGciFromDeals = (deals: number) => {
    return deals * annualGoals.avg_sale_price * (annualGoals.commission_rate / 100) * (annualGoals.split_percent / 100);
  };

  const updateMonthlyGoal = (monthIndex: number, deals: number) => {
    const updated = [...monthlyGoals];
    const calculatedGci = calculateGciFromDeals(deals);
    updated[monthIndex] = { ...updated[monthIndex], deals, gci: calculatedGci };
    setMonthlyGoals(updated);
    if (user) {
      localStorage.setItem(`monthlyGoals_${user.id}_${currentYear}`, JSON.stringify(updated));
    }
  };

  const resetToEvenDistribution = () => {
    const newGoals = createDefaultMonthlyGoals(annualGoals.deals_goal, annualGoals.gci_goal);
    setMonthlyGoals(newGoals);
    if (user) {
      localStorage.setItem(`monthlyGoals_${user.id}_${currentYear}`, JSON.stringify(newGoals));
    }
    toast({ title: 'Goals reset to even distribution' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            {isReadOnly ? `${viewingAgentName}'s ${currentYear} Goals` : `${currentYear} Goals`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isReadOnly ? 'Viewing agent goals (read-only)' : 'Track your annual targets'}
          </p>
        </div>
        {!isReadOnly && (
          <Button 
            variant="outline" 
            className="border-gold/30 text-gold hover:bg-gold/10"
            onClick={() => setShowSetup(true)}
          >
            <Edit2 className="h-4 w-4 mr-2" /> {hasGoalsSet ? 'Edit Goals' : 'Set Goals'}
          </Button>
        )}
      </div>

      {/* Goal Setup Dialog */}
      <Dialog open={!isReadOnly && (showSetup || !hasGoalsSet)} onOpenChange={setShowSetup}>
        <DialogContent className="border-gold/20 bg-card">
          <DialogHeader>
            <DialogTitle className="text-gold font-display text-xl">Set Your {currentYear} Goals</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            {/* Calculation inputs section */}
            <div className="p-4 rounded-lg bg-background/50 border border-gold/20 space-y-4">
              <p className="text-sm font-medium text-gold">Calculate GCI from deals</p>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Avg Sale Price</Label>
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-1">$</span>
                    <Input
                      type="number"
                      placeholder="350000"
                      value={formData.avg_sale_price}
                      onChange={(e) => {
                        const newFormData = { ...formData, avg_sale_price: e.target.value };
                        // Auto-calculate GCI
                        const deals = parseFloat(newFormData.deals_goal) || 0;
                        const price = parseFloat(e.target.value) || 0;
                        const commission = parseFloat(newFormData.commission_rate) || 0;
                        const split = parseFloat(newFormData.split_percent) || 0;
                        const calculatedGci = deals * price * (commission / 100) * (split / 100);
                        newFormData.gci_goal = Math.round(calculatedGci).toString();
                        setFormData(newFormData);
                      }}
                      className="text-sm"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Commission %</Label>
                  <div className="flex items-center">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="3"
                      value={formData.commission_rate}
                      onChange={(e) => {
                        const newFormData = { ...formData, commission_rate: e.target.value };
                        const deals = parseFloat(newFormData.deals_goal) || 0;
                        const price = parseFloat(newFormData.avg_sale_price) || 0;
                        const commission = parseFloat(e.target.value) || 0;
                        const split = parseFloat(newFormData.split_percent) || 0;
                        const calculatedGci = deals * price * (commission / 100) * (split / 100);
                        newFormData.gci_goal = Math.round(calculatedGci).toString();
                        setFormData(newFormData);
                      }}
                      className="text-sm"
                    />
                    <span className="text-muted-foreground ml-1">%</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Your Split %</Label>
                  <div className="flex items-center">
                    <Input
                      type="number"
                      step="1"
                      placeholder="70"
                      value={formData.split_percent}
                      onChange={(e) => {
                        const newFormData = { ...formData, split_percent: e.target.value };
                        const deals = parseFloat(newFormData.deals_goal) || 0;
                        const price = parseFloat(newFormData.avg_sale_price) || 0;
                        const commission = parseFloat(newFormData.commission_rate) || 0;
                        const split = parseFloat(e.target.value) || 0;
                        const calculatedGci = deals * price * (commission / 100) * (split / 100);
                        newFormData.gci_goal = Math.round(calculatedGci).toString();
                        setFormData(newFormData);
                      }}
                      className="text-sm"
                    />
                    <span className="text-muted-foreground ml-1">%</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-foreground">Annual Deals Goal</Label>
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-gold" />
                <Input
                  type="number"
                  placeholder="e.g., 24"
                  value={formData.deals_goal}
                  onChange={(e) => {
                    const newFormData = { ...formData, deals_goal: e.target.value };
                    // Auto-calculate GCI
                    const deals = parseFloat(e.target.value) || 0;
                    const price = parseFloat(newFormData.avg_sale_price) || 0;
                    const commission = parseFloat(newFormData.commission_rate) || 0;
                    const split = parseFloat(newFormData.split_percent) || 0;
                    const calculatedGci = deals * price * (commission / 100) * (split / 100);
                    newFormData.gci_goal = Math.round(calculatedGci).toString();
                    setFormData(newFormData);
                  }}
                  className="text-lg"
                />
                <span className="text-muted-foreground">deals</span>
              </div>
              <p className="text-xs text-muted-foreground">How many deals do you want to close this year?</p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-foreground">Annual GCI Goal (auto-calculated)</Label>
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
              <p className="text-xs text-muted-foreground">
                Based on {formData.deals_goal || 0} deals × {formatCurrency(parseInt(formData.avg_sale_price || '0'))} × {formData.commission_rate || 0}% × {formData.split_percent || 0}% split
              </p>
            </div>

            {/* Pipeline Fallout Rate */}
            <div className="p-4 rounded-lg bg-background/50 border border-gold/20 space-y-3">
              <div className="space-y-2">
                <Label className="text-foreground">Pipeline Fallout Rate</Label>
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-gold" />
                  <Input
                    type="number"
                    step="1"
                    placeholder="50"
                    value={formData.fallout_rate}
                    onChange={(e) => setFormData({ ...formData, fallout_rate: e.target.value })}
                    className="text-lg w-24"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  What percentage of your pipeline leads do NOT convert to closed deals?
                </p>
              </div>
              
              {/* Pipeline Requirements Preview */}
              {formData.deals_goal && (
                <div className="pt-3 border-t border-gold/20 space-y-2">
                  <p className="text-sm font-medium text-gold">Pipeline Names Required</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-card">
                      <p className="text-xs text-muted-foreground">Annual</p>
                      <p className="text-lg font-bold text-foreground">
                        {Math.ceil((parseFloat(formData.deals_goal) || 0) / ((100 - (parseFloat(formData.fallout_rate) || 50)) / 100))}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-card">
                      <p className="text-xs text-muted-foreground">Quarterly</p>
                      <p className="text-lg font-bold text-foreground">
                        {Math.ceil(((parseFloat(formData.deals_goal) || 0) / 4) / ((100 - (parseFloat(formData.fallout_rate) || 50)) / 100))}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-card">
                      <p className="text-xs text-muted-foreground">Monthly</p>
                      <p className="text-lg font-bold text-foreground">
                        {Math.ceil(((parseFloat(formData.deals_goal) || 0) / 12) / ((100 - (parseFloat(formData.fallout_rate) || 50)) / 100))}
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
                    <span className="text-muted-foreground ml-2">/ {totalDealsGoal.toFixed(1)} goal</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+{actualMetrics.deals_pending} pending</p>
                    <p className="text-xs text-muted-foreground">{totalDeals} total pipeline</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalDealsGoal - actualMetrics.deals_closed > 0 
                    ? `${(totalDealsGoal - actualMetrics.deals_closed).toFixed(1)} more deals to reach your goal`
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
                    <span className="text-muted-foreground ml-2">/ ${Math.round(totalGciGoal).toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-medium">+${actualMetrics.gci_pending.toLocaleString()} pending</p>
                    <p className="text-xs text-muted-foreground">${totalGci.toLocaleString()} total</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalGciGoal - actualMetrics.gci_earned > 0 
                    ? `${formatCurrency(Math.round(totalGciGoal - actualMetrics.gci_earned))} more to reach your goal`
                    : '🎉 Goal achieved!'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Goal Breakdown Section */}
          <Card className="border-gold/20 bg-card">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gold" />
                  Goal Breakdown
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={resetToEvenDistribution}
                    className="text-xs"
                  >
                    Reset to Even
                  </Button>
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
              </div>
              <p className="text-xs text-muted-foreground mt-2">Click on any value to edit it</p>
            </CardHeader>
            <CardContent>
              {breakdownView === 'monthly' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {monthNames.map((month, index) => (
                    <div 
                      key={month} 
                      className="p-3 rounded-lg bg-background/50 border border-primary/10 hover:border-gold/30 transition-colors cursor-pointer"
                      onClick={() => setEditingMonth(editingMonth === index ? null : index)}
                    >
                      <p className="text-sm font-medium text-foreground mb-2">{month}</p>
                      {editingMonth === index ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Deals</label>
                            <Input
                              type="number"
                              step="0.1"
                              value={monthlyGoals[index]?.deals || 0}
                              onChange={(e) => updateMonthlyGoal(index, parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                            <p className="text-xs text-muted-foreground">Auto GCI</p>
                            <p className="text-sm font-bold text-green-400">
                              ${formatCurrency(Math.round(calculateGciFromDeals(monthlyGoals[index]?.deals || 0)))}
                            </p>
                          </div>
                          <Button 
                            size="sm" 
                            className="w-full h-6 text-xs mt-1"
                            onClick={() => setEditingMonth(null)}
                          >
                            Done
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Home className="h-3 w-3 text-gold" />
                            <span className="text-xs text-muted-foreground">Deals:</span>
                            <span className="text-xs font-medium text-gold">{(monthlyGoals[index]?.deals || 0).toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-green-400" />
                            <span className="text-xs text-muted-foreground">GCI:</span>
                            <span className="text-xs font-medium text-green-400">${formatCurrency(Math.round(monthlyGoals[index]?.gci || 0))}</span>
                          </div>
                          {(monthlyGoals[index]?.focus || monthlyGoals[index]?.target) && (
                            <div className="mt-2 pt-2 border-t border-primary/10">
                              {monthlyGoals[index]?.focus && (
                                <p className="text-xs text-primary truncate" title={monthlyGoals[index].focus}>
                                  📌 {monthlyGoals[index].focus}
                                </p>
                              )}
                              {monthlyGoals[index]?.target && (
                                <p className="text-xs text-muted-foreground truncate" title={monthlyGoals[index].target}>
                                  🎯 {monthlyGoals[index].target}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {quarterNames.map((quarter, index) => {
                    const quarterGoals = getQuarterlyGoals(index);
                    return (
                      <div 
                        key={quarter} 
                        className="p-4 rounded-lg bg-background/50 border border-primary/10 hover:border-gold/30 transition-colors cursor-pointer"
                        onClick={() => setEditingQuarter(editingQuarter === index ? null : index)}
                      >
                        <p className="text-sm font-medium text-foreground mb-3">{quarter}</p>
                        {editingQuarter === index ? (
                          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs text-muted-foreground">Edit deals per month (GCI auto-calculates)</p>
                            <div className="space-y-2">
                              {[0, 1, 2].map((monthOffset) => {
                                const monthIndex = index * 3 + monthOffset;
                                const monthDeals = monthlyGoals[monthIndex]?.deals || 0;
                                return (
                                  <div key={monthIndex} className="flex items-center gap-2">
                                    <span className="text-xs w-8">{monthNames[monthIndex]}</span>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      placeholder="Deals"
                                      value={monthDeals}
                                      onChange={(e) => updateMonthlyGoal(monthIndex, parseFloat(e.target.value) || 0)}
                                      className="h-6 text-xs flex-1"
                                    />
                                    <span className="text-xs text-green-400 w-20 text-right">
                                      ${formatCurrency(Math.round(calculateGciFromDeals(monthDeals)))}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <Button 
                              size="sm" 
                              className="w-full h-6 text-xs"
                              onClick={() => setEditingQuarter(null)}
                            >
                              Done
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Home className="h-4 w-4 text-gold" />
                                <span className="text-sm text-muted-foreground">Deals</span>
                              </div>
                              <span className="text-lg font-bold text-gold">{formatCurrency(quarterGoals.deals)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4 text-green-400" />
                                <span className="text-sm text-muted-foreground">GCI</span>
                              </div>
                              <span className="text-lg font-bold text-green-400">${formatCurrency(Math.round(quarterGoals.gci))}</span>
                            </div>
                            {quarterGoals.fourOneOneGoals.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-primary/10 space-y-1">
                                <p className="text-xs font-medium text-muted-foreground mb-1">411 Goals</p>
                                {quarterGoals.fourOneOneGoals.map((goal, idx) => (
                                  <div key={idx} className="text-xs">
                                    <span className="text-muted-foreground">{goal.month}:</span>
                                    {goal.focus && (
                                      <p className="text-primary truncate pl-2" title={goal.focus}>📌 {goal.focus}</p>
                                    )}
                                    {goal.target && (
                                      <p className="text-muted-foreground truncate pl-2" title={goal.target}>🎯 {goal.target}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Total: {monthlyGoals.reduce((sum, m) => sum + m.deals, 0).toFixed(1)} deals / {formatCurrency(Math.round(monthlyGoals.reduce((sum, m) => sum + m.gci, 0)))} GCI
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
                    <p className="text-xl font-bold text-green-400">{formatCurrency(actualMetrics.deals_closed)}</p>
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
                    <p className="text-xl font-bold text-amber-400">{formatCurrency(actualMetrics.deals_pending)}</p>
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
