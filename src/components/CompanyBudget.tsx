import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface BudgetExpense {
  id: string;
  year: number;
  month: number;
  category: string;
  amount: number;
  notes: string | null;
}

interface Deal {
  id: string;
  stage: string;
  commission_rate: number | null;
  deal_value: number | null;
  company_split_percentage: number | null;
}

const DEFAULT_CATEGORIES = [
  'Rent/Office',
  'Salaries',
  'Marketing',
  'Technology',
  'Insurance',
  'Utilities',
  'Other',
];

const CompanyBudget = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [projectedRevenue, setProjectedRevenue] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conditionalCount, setConditionalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch expenses for the selected month
    const { data: expensesData, error: expensesError } = await supabase
      .from('company_budget_expenses')
      .select('*')
      .eq('year', selectedYear)
      .eq('month', selectedMonth);

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
    } else {
      setExpenses(expensesData || []);
    }

    // Fetch pending and conditional deals to calculate projected revenue
    // Pending = under_contract stage, Conditional = offer stage (FUB)
    const { data: dealsData, error: dealsError } = await supabase
      .from('deals')
      .select('id, stage, commission_rate, deal_value, company_split_percentage')
      .in('stage', ['under_contract', 'offer']);

    if (dealsError) {
      console.error('Error fetching deals:', dealsError);
      setProjectedRevenue(0);
      setPendingCount(0);
      setConditionalCount(0);
    } else {
      const deals = dealsData || [];
      const pendingDeals = deals.filter(d => d.stage === 'under_contract');
      const conditionalDeals = deals.filter(d => d.stage === 'offer');
      
      // Calculate company revenue: deal_value * commission_rate * company_split (30%)
      const calculateDealRevenue = (deal: Deal) => {
        const value = deal.deal_value || 0;
        const rate = deal.commission_rate || 0.02;
        const companySplit = deal.company_split_percentage || 30;
        return value * rate * (companySplit / 100);
      };
      
      const totalRevenue = deals.reduce((sum, deal) => sum + calculateDealRevenue(deal), 0);
      
      setProjectedRevenue(totalRevenue);
      setPendingCount(pendingDeals.length);
      setConditionalCount(conditionalDeals.length);
    }

    setLoading(false);
  };

  const handleAddExpense = async () => {
    if (!newCategory || !newAmount || !user) {
      toast.error('Please fill in category and amount');
      return;
    }

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSaving(true);

    // Check if category already exists for this month
    const existingExpense = expenses.find(e => e.category === newCategory);
    
    if (existingExpense) {
      // Update existing
      const { error } = await supabase
        .from('company_budget_expenses')
        .update({ amount, notes: newNotes || null })
        .eq('id', existingExpense.id);

      if (error) {
        toast.error('Failed to update expense');
        console.error(error);
      } else {
        toast.success('Expense updated');
        setNewCategory('');
        setNewAmount('');
        setNewNotes('');
        fetchData();
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('company_budget_expenses')
        .insert({
          year: selectedYear,
          month: selectedMonth,
          category: newCategory,
          amount,
          notes: newNotes || null,
          created_by: user.id,
        });

      if (error) {
        toast.error('Failed to add expense');
        console.error(error);
      } else {
        toast.success('Expense added');
        setNewCategory('');
        setNewAmount('');
        setNewNotes('');
        fetchData();
      }
    }

    setSaving(false);
  };

  const handleDeleteExpense = async (id: string) => {
    const { error } = await supabase
      .from('company_budget_expenses')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete expense');
      console.error(error);
    } else {
      toast.success('Expense deleted');
      fetchData();
    }
  };

  const handleUpdateExpense = async (id: string, amount: number) => {
    const { error } = await supabase
      .from('company_budget_expenses')
      .update({ amount })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update expense');
    } else {
      fetchData();
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = projectedRevenue - totalExpenses;
  const isDeficit = netIncome < 0;
  const isSurplus = netIncome > 0;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-blue-500 font-display flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Monthly Budget
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-md border border-border bg-background text-sm"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-md border border-border bg-background text-sm"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Projected Revenue</span>
            </div>
            <p className="text-2xl font-bold text-blue-500">{formatCurrency(projectedRevenue)}</p>
            <p className="text-xs text-muted-foreground">{pendingCount} pending, {conditionalCount} conditional deals</p>
          </div>

          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Total Expenses</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground">{expenses.length} expense categories</p>
          </div>

          <div className={`p-4 rounded-lg border ${
            isDeficit 
              ? 'bg-red-500/10 border-red-500/30' 
              : isSurplus 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-muted/50 border-border'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              {isDeficit ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : isSurplus ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">
                {isDeficit ? 'Deficit' : isSurplus ? 'Surplus' : 'Net Income'}
              </span>
            </div>
            <p className={`text-2xl font-bold ${
              isDeficit ? 'text-red-500' : isSurplus ? 'text-green-500' : 'text-foreground'
            }`}>
              {formatCurrency(Math.abs(netIncome))}
            </p>
            <p className="text-xs text-muted-foreground">
              {isDeficit ? 'Expenses exceed revenue' : isSurplus ? 'Revenue exceeds expenses' : 'Breaking even'}
            </p>
          </div>
        </div>

        {/* Expense List */}
        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Fixed Expenses</h4>
          
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No expenses added for this month yet.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <Badge variant="outline" className="min-w-[100px] justify-center">
                    {expense.category}
                  </Badge>
                  <Input
                    type="number"
                    value={expense.amount}
                    onChange={(e) => {
                      const newExpenses = expenses.map(exp => 
                        exp.id === expense.id ? { ...exp, amount: parseFloat(e.target.value) || 0 } : exp
                      );
                      setExpenses(newExpenses);
                    }}
                    onBlur={(e) => handleUpdateExpense(expense.id, parseFloat(e.target.value) || 0)}
                    className="w-32 text-right"
                  />
                  {expense.notes && (
                    <span className="text-xs text-muted-foreground flex-1 truncate">{expense.notes}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteExpense(expense.id)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Expense Form */}
        <div className="p-4 rounded-lg border border-dashed border-border bg-muted/30">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Expense
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">Select category...</option>
                {DEFAULT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddExpense}
                disabled={saving || !newCategory || !newAmount}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* No Deals Warning */}
        {projectedRevenue === 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-amber-600">
              No pending or conditional deals found. Revenue projection is based on active deals in the pipeline.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CompanyBudget;
