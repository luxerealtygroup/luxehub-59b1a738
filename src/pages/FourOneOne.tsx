import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Save, Target, Trophy, TrendingUp, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';

interface Weekly411 {
  id?: string;
  week_start_date: string;
  calls_goal: number;
  calls_actual: number;
  appointments_goal: number;
  appointments_actual: number;
  listings_goal: number;
  listings_actual: number;
  contracts_goal: number;
  contracts_actual: number;
  priority_1: string;
  priority_1_completed: boolean;
  priority_2: string;
  priority_2_completed: boolean;
  priority_3: string;
  priority_3_completed: boolean;
  priority_4: string;
  priority_4_completed: boolean;
  personal_priority_1: string;
  personal_priority_1_completed: boolean;
  personal_priority_2: string;
  personal_priority_2_completed: boolean;
  personal_priority_3: string;
  personal_priority_3_completed: boolean;
  wins: string;
  challenges: string;
  next_steps: string;
  notes: string;
}

interface ProductionGoals {
  id?: string;
  year: number;
  annual_units_goal: number;
  annual_gci_goal: number;
  annual_volume_goal: number;
  annual_focus: string;
  monthly_goals: { month: number; focus: string; target: string }[];
}

const emptyWeekly: Weekly411 = {
  week_start_date: '',
  calls_goal: 50,
  calls_actual: 0,
  appointments_goal: 10,
  appointments_actual: 0,
  listings_goal: 2,
  listings_actual: 0,
  contracts_goal: 2,
  contracts_actual: 0,
  priority_1: '',
  priority_1_completed: false,
  priority_2: '',
  priority_2_completed: false,
  priority_3: '',
  priority_3_completed: false,
  priority_4: '',
  priority_4_completed: false,
  personal_priority_1: '',
  personal_priority_1_completed: false,
  personal_priority_2: '',
  personal_priority_2_completed: false,
  personal_priority_3: '',
  personal_priority_3_completed: false,
  wins: '',
  challenges: '',
  next_steps: '',
  notes: '',
};

const FourOneOne = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeklyData, setWeeklyData] = useState<Weekly411>({ ...emptyWeekly });
  const [annualGoals, setAnnualGoals] = useState<ProductionGoals>({
    year: 2026,
    annual_units_goal: 24,
    annual_gci_goal: 150000,
    annual_volume_goal: 5000000,
    annual_focus: '',
    monthly_goals: [],
  });

  const currentMonth = new Date().getMonth();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fetchWeeklyData = async () => {
    if (!user) return;
    const weekStart = format(currentWeek, 'yyyy-MM-dd');
    
    const { data } = await supabase
      .from('weekly_411')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (data) {
      setWeeklyData(data as Weekly411);
    } else {
      setWeeklyData({ ...emptyWeekly, week_start_date: weekStart });
    }
  };

  const fetchAnnualGoals = async () => {
    if (!user) return;
    const year = 2026;
    
    const { data } = await supabase
      .from('production_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (data) {
      setAnnualGoals({
        ...data,
        monthly_goals: (data.monthly_goals as { month: number; focus: string; target: string }[]) || [],
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWeeklyData();
    fetchAnnualGoals();
  }, [user, currentWeek]);

  const saveWeeklyData = async () => {
    if (!user) return;
    setSaving(true);

    const weekStart = format(currentWeek, 'yyyy-MM-dd');
    const payload = {
      ...weeklyData,
      user_id: user.id,
      week_start_date: weekStart,
    };

    const { error } = weeklyData.id
      ? await supabase.from('weekly_411').update(payload).eq('id', weeklyData.id)
      : await supabase.from('weekly_411').insert(payload);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved!', description: 'Your 4-1-1 has been updated' });
      fetchWeeklyData();
    }
    setSaving(false);
  };

  const saveAnnualGoals = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      ...annualGoals,
      user_id: user.id,
    };

    const { error } = annualGoals.id
      ? await supabase.from('production_goals').update(payload).eq('id', annualGoals.id)
      : await supabase.from('production_goals').insert(payload);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved!', description: 'Annual goals updated' });
      fetchAnnualGoals();
    }
    setSaving(false);
  };

  const getMonthlyGoal = (month: number) => {
    return annualGoals.monthly_goals.find(g => g.month === month) || { month, focus: '', target: '' };
  };

  const updateMonthlyGoal = (month: number, field: 'focus' | 'target', value: string) => {
    const updated = [...annualGoals.monthly_goals];
    const idx = updated.findIndex(g => g.month === month);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], [field]: value };
    } else {
      updated.push({ month, focus: field === 'focus' ? value : '', target: field === 'target' ? value : '' });
    }
    setAnnualGoals({ ...annualGoals, monthly_goals: updated });
  };

  const calcProgress = (actual: number, goal: number) => goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading 4-1-1...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">4-1-1 Tracker</h1>
          <p className="text-muted-foreground mt-1">Weekly accountability & goal tracking</p>
        </div>
      </div>

      <Tabs defaultValue="weekly" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="weekly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Target className="h-4 w-4 mr-2" /> Weekly
          </TabsTrigger>
          <TabsTrigger value="monthly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TrendingUp className="h-4 w-4 mr-2" /> Monthly
          </TabsTrigger>
          <TabsTrigger value="annual" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Trophy className="h-4 w-4 mr-2" /> Annual
          </TabsTrigger>
        </TabsList>

        {/* WEEKLY TAB */}
        <TabsContent value="weekly" className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <h2 className="font-display text-lg font-semibold">
              Week of {format(currentWeek, 'MMM d, yyyy')}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Activity Metrics */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">Weekly Activities</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Calls', goal: 'calls_goal', actual: 'calls_actual' },
                { label: 'Appointments', goal: 'appointments_goal', actual: 'appointments_actual' },
                { label: 'Listings', goal: 'listings_goal', actual: 'listings_actual' },
                { label: 'Contracts', goal: 'contracts_goal', actual: 'contracts_actual' },
              ].map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <Label className="text-sm font-medium">{metric.label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Actual"
                      value={weeklyData[metric.actual as keyof Weekly411] as number}
                      onChange={(e) => setWeeklyData({ ...weeklyData, [metric.actual]: parseInt(e.target.value) || 0 })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Goal"
                      value={weeklyData[metric.goal as keyof Weekly411] as number}
                      onChange={(e) => setWeeklyData({ ...weeklyData, [metric.goal]: parseInt(e.target.value) || 0 })}
                      className="w-20 text-muted-foreground"
                    />
                  </div>
                  <Progress 
                    value={calcProgress(
                      weeklyData[metric.actual as keyof Weekly411] as number,
                      weeklyData[metric.goal as keyof Weekly411] as number
                    )} 
                    className="h-2"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Business Priorities */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">4 Business Priorities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4].map((num) => (
                <div key={num} className="flex items-center gap-3">
                  <Checkbox
                    checked={weeklyData[`priority_${num}_completed` as keyof Weekly411] as boolean}
                    onCheckedChange={(checked) => 
                      setWeeklyData({ ...weeklyData, [`priority_${num}_completed`]: checked })
                    }
                  />
                  <Input
                    placeholder={`Business Priority ${num}`}
                    value={weeklyData[`priority_${num}` as keyof Weekly411] as string || ''}
                    onChange={(e) => setWeeklyData({ ...weeklyData, [`priority_${num}`]: e.target.value })}
                    className={weeklyData[`priority_${num}_completed` as keyof Weekly411] ? 'line-through text-muted-foreground' : ''}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Personal Priorities */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="text-lg font-display text-green-500">3 Personal Priorities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((num) => (
                <div key={num} className="flex items-center gap-3">
                  <Checkbox
                    checked={weeklyData[`personal_priority_${num}_completed` as keyof Weekly411] as boolean}
                    onCheckedChange={(checked) => 
                      setWeeklyData({ ...weeklyData, [`personal_priority_${num}_completed`]: checked })
                    }
                    className="border-green-500/50 data-[state=checked]:bg-green-500"
                  />
                  <Input
                    placeholder={`Personal Priority ${num}`}
                    value={weeklyData[`personal_priority_${num}` as keyof Weekly411] as string || ''}
                    onChange={(e) => setWeeklyData({ ...weeklyData, [`personal_priority_${num}`]: e.target.value })}
                    className={weeklyData[`personal_priority_${num}_completed` as keyof Weekly411] ? 'line-through text-muted-foreground' : 'border-green-500/20 focus:border-green-500'}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Accountability Notes */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <FileText className="h-5 w-5" /> Accountability Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Wins This Week</Label>
                <Textarea
                  placeholder="What went well?"
                  value={weeklyData.wins || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, wins: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Challenges</Label>
                <Textarea
                  placeholder="What obstacles did you face?"
                  value={weeklyData.challenges || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, challenges: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Next Steps</Label>
                <Textarea
                  placeholder="What will you do next week?"
                  value={weeklyData.next_steps || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, next_steps: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  placeholder="Anything else?"
                  value={weeklyData.notes || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveWeeklyData} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Weekly 4-1-1'}
          </Button>
        </TabsContent>

        {/* MONTHLY TAB */}
        <TabsContent value="monthly" className="space-y-6">
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">Monthly Goals (2026)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {monthNames.map((name, idx) => {
                const goal = getMonthlyGoal(idx);
                const isCurrentMonth = idx === currentMonth;
                return (
                  <div 
                    key={name} 
                    className={`p-3 rounded-lg border ${isCurrentMonth ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <p className={`font-medium text-sm mb-2 ${isCurrentMonth ? 'text-primary' : ''}`}>
                      {name} {isCurrentMonth && '(Current)'}
                    </p>
                    <Input
                      placeholder="Focus"
                      value={goal.focus}
                      onChange={(e) => updateMonthlyGoal(idx, 'focus', e.target.value)}
                      className="mb-2 text-sm"
                    />
                    <Input
                      placeholder="Target (e.g., 2 closings)"
                      value={goal.target}
                      onChange={(e) => updateMonthlyGoal(idx, 'target', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Button onClick={saveAnnualGoals} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Monthly Goals'}
          </Button>
        </TabsContent>

        {/* ANNUAL TAB */}
        <TabsContent value="annual" className="space-y-6">
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" /> Annual Goals ({annualGoals.year})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Units Goal</Label>
                  <Input
                    type="number"
                    placeholder="24"
                    value={annualGoals.annual_units_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_units_goal: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GCI Goal ($)</Label>
                  <Input
                    type="number"
                    placeholder="150000"
                    value={annualGoals.annual_gci_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_gci_goal: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Volume Goal ($)</Label>
                  <Input
                    type="number"
                    placeholder="5000000"
                    value={annualGoals.annual_volume_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_volume_goal: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Annual Focus / Big Why</Label>
                <Textarea
                  placeholder="What's your driving motivation this year? Your 'One Thing'?"
                  value={annualGoals.annual_focus || ''}
                  onChange={(e) => setAnnualGoals({ ...annualGoals, annual_focus: e.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveAnnualGoals} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Annual Goals'}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FourOneOne;