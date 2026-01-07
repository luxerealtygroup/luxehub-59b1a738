import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';

interface MonthlyData {
  month: string;
  monthLabel: string;
  expenses: number;
  projectedRevenue: number;
  netIncome: number;
}

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const AnnualBudgetChart = () => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const year = 2026;

  useEffect(() => {
    fetchAnnualData();
  }, []);

  const fetchAnnualData = async () => {
    setLoading(true);

    // Fetch all expenses for 2026
    const { data: expensesData, error: expensesError } = await supabase
      .from('company_budget_expenses')
      .select('*')
      .eq('year', year);

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
    }

    // Fetch all deals with expected close dates in 2026
    const { data: dealsData, error: dealsError } = await supabase
      .from('deals')
      .select('id, stage, commission_rate, deal_value, company_split_percentage, expected_close_date')
      .in('stage', ['under_contract', 'offer', 'closed'])
      .gte('expected_close_date', `${year}-01-01`)
      .lte('expected_close_date', `${year}-12-31`);

    if (dealsError) {
      console.error('Error fetching deals:', dealsError);
    }

    // Build monthly data
    const monthlyData: MonthlyData[] = MONTHS.map(m => {
      // Sum expenses for this month
      const monthExpenses = (expensesData || [])
        .filter(e => e.month === m.value)
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Sum projected revenue for deals closing this month
      const monthDeals = (dealsData || []).filter(d => {
        if (!d.expected_close_date) return false;
        const dealMonth = new Date(d.expected_close_date).getMonth() + 1;
        return dealMonth === m.value;
      });

      const monthRevenue = monthDeals.reduce((sum, deal) => {
        const value = deal.deal_value || 0;
        const rate = (deal.commission_rate || 2) / 100;
        const companySplit = (deal.company_split_percentage || 30) / 100;
        return sum + (value * rate * companySplit);
      }, 0);

      return {
        month: `${year}-${String(m.value).padStart(2, '0')}`,
        monthLabel: m.label,
        expenses: monthExpenses,
        projectedRevenue: monthRevenue,
        netIncome: monthRevenue - monthExpenses,
      };
    });

    setData(monthlyData);
    setLoading(false);
  };

  const totalExpenses = data.reduce((sum, d) => sum + d.expenses, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.projectedRevenue, 0);
  const totalNet = totalRevenue - totalExpenses;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-blue-500 font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> 2026 Budget vs Projected Revenue
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span className="text-muted-foreground">Expenses: {formatCurrency(totalExpenses)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-muted-foreground">Revenue: {formatCurrency(totalRevenue)}</span>
            </div>
            <div className={`font-semibold ${totalNet >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              Net: {formatCurrency(totalNet)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis 
                dataKey="monthLabel" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              />
              <YAxis 
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'expenses' ? 'Expenses' : name === 'projectedRevenue' ? 'Projected Revenue' : 'Net Income'
                ]}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend 
                formatter={(value) => 
                  value === 'expenses' ? 'Expenses' : value === 'projectedRevenue' ? 'Projected Revenue' : 'Net Income'
                }
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Bar dataKey="expenses" name="expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="projectedRevenue" name="projectedRevenue" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default AnnualBudgetChart;
