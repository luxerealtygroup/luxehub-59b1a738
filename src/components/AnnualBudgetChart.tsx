import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

interface MonthlyData {
  monthLabel: string;
  projectedRevenue: number;
  expenses: number;
}

const AnnualBudgetChart = () => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnualBudget = async () => {
      setLoading(true);
      try {
        const currentYear = new Date().getFullYear();

        // Fetch expenses from company_budget_expenses
        const { data: expenses, error: expError } = await supabase
          .from('company_budget_expenses')
          .select('*')
          .eq('year', currentYear)
          .order('month', { ascending: true });

        if (expError) {
          console.error('Error fetching budget expenses:', expError);
        }

        // Fetch company goals for revenue projections
        const { data: goals } = await supabase
          .from('company_goals')
          .select('*')
          .eq('year', currentYear)
          .maybeSingle();

        // Build monthly data (Jan–Dec)
        const monthlyData: MonthlyData[] = Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          const monthName = new Date(currentYear, i, 1).toLocaleString('default', { month: 'long' });

          const monthExpenses = (expenses || [])
            .filter(e => e.month === month)
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);

          // Projected revenue = annual revenue goal / 12 (simple even distribution)
          const projectedRevenue = goals?.annual_revenue_goal
            ? Number(goals.annual_revenue_goal) / 12
            : 0;

          return {
            monthLabel: monthName,
            projectedRevenue,
            expenses: monthExpenses,
          };
        });

        setData(monthlyData);
      } catch (error) {
        console.error('Failed to fetch annual budget data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnualBudget();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Annual Budget
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalExpenses = data.reduce((sum, item) => sum + item.expenses, 0);
  const totalRevenue = data.reduce((sum, item) => sum + item.projectedRevenue, 0);
  const totalNet = totalRevenue - totalExpenses;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Annual Budget
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
                tickFormatter={(v) => formatCurrencyCompact(v)} 
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
