import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Plus, Target, TrendingUp, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Goal {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period: string;
  start_date: string;
  end_date: string | null;
  category: string;
}

const businessGoalTypes = [
  { value: 'deals_closed', label: 'Deals Closed' },
  { value: 'revenue', label: 'Revenue Generated' },
  { value: 'calls', label: 'Calls Made' },
  { value: 'appointments', label: 'Appointments Set' },
  { value: 'showings', label: 'Showings Completed' },
];

const personalGoalTypes = [
  { value: 'health_fitness', label: 'Health & Fitness' },
  { value: 'family_time', label: 'Family Time' },
  { value: 'learning', label: 'Learning & Development' },
  { value: 'savings', label: 'Savings Goal' },
  { value: 'hobbies', label: 'Hobbies & Interests' },
  { value: 'wellness', label: 'Wellness & Self-Care' },
];

const Goals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'business' | 'personal'>('business');
  
  const [newGoal, setNewGoal] = useState({
    goal_type: 'deals_closed',
    target_value: '',
    period: 'monthly',
    category: 'business' as 'business' | 'personal'
  });

  const fetchGoals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('agent_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setGoals(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchGoals();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('agent_goals').insert({
      user_id: user.id,
      goal_type: newGoal.goal_type,
      target_value: parseFloat(newGoal.target_value),
      current_value: 0,
      period: newGoal.period,
      category: newGoal.category
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Goal created!' });
      setDialogOpen(false);
      setActiveCategory(newGoal.category);
      setNewGoal({ goal_type: 'deals_closed', target_value: '', period: 'monthly', category: 'business' });
      fetchGoals();
    }
  };

  const updateProgress = async (goalId: string, newValue: number) => {
    const { error } = await supabase
      .from('agent_goals')
      .update({ current_value: newValue })
      .eq('id', goalId);
    
    if (!error) {
      fetchGoals();
      toast({ title: 'Progress updated!' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading goals...</div>;
  }

  const filteredGoals = goals.filter(g => g.category === activeCategory);
  
  const avgProgress = filteredGoals.length > 0
    ? Math.round(filteredGoals.reduce((sum, g) => sum + (g.current_value / g.target_value * 100), 0) / filteredGoals.length)
    : 0;

  const goalTypes = activeCategory === 'business' ? businessGoalTypes : personalGoalTypes;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Goals</h1>
          <p className="text-muted-foreground mt-1">Track your targets and celebrate wins</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="h-4 w-4 mr-2" /> Set Goal
            </Button>
          </DialogTrigger>
          <DialogContent className="border-gold/20 bg-card">
            <DialogHeader>
              <DialogTitle className="text-gold font-display">Set New Goal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Select value={newGoal.category} onValueChange={(v: 'business' | 'personal') => setNewGoal({ 
                ...newGoal, 
                category: v,
                goal_type: v === 'business' ? 'deals_closed' : 'health_fitness'
              })}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newGoal.goal_type} onValueChange={(v) => setNewGoal({ ...newGoal, goal_type: v })}>
                <SelectTrigger><SelectValue placeholder="Goal type" /></SelectTrigger>
                <SelectContent>
                  {(newGoal.category === 'business' ? businessGoalTypes : personalGoalTypes).map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Target value"
                value={newGoal.target_value}
                onChange={(e) => setNewGoal({ ...newGoal, target_value: e.target.value })}
                required
              />
              <Select value={newGoal.period} onValueChange={(v) => setNewGoal({ ...newGoal, period: v })}>
                <SelectTrigger><SelectValue placeholder="Period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
                Create Goal
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2">
        <Button
          variant={activeCategory === 'business' ? 'default' : 'outline'}
          onClick={() => setActiveCategory('business')}
          className={activeCategory === 'business' ? 'bg-gold text-gold-foreground' : 'border-gold/30 text-gold'}
        >
          Business Goals
        </Button>
        <Button
          variant={activeCategory === 'personal' ? 'default' : 'outline'}
          onClick={() => setActiveCategory('personal')}
          className={activeCategory === 'personal' ? 'bg-primary text-primary-foreground' : 'border-primary/30 text-primary'}
        >
          Personal Goals
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {activeCategory === 'business' ? 'Business' : 'Personal'} Goals
            </CardTitle>
            <Target className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{filteredGoals.length}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Progress</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gold">{avgProgress}%</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <Award className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {goals.filter(g => g.current_value >= g.target_value).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredGoals.length === 0 ? (
          <Card className="col-span-full border-gold/10 bg-card/50">
            <CardContent className="text-center py-12">
              <Target className="h-12 w-12 mx-auto text-gold/30 mb-4" />
              <p className="text-muted-foreground">No {activeCategory} goals set yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first {activeCategory} goal to start tracking!</p>
            </CardContent>
          </Card>
        ) : (
          filteredGoals.map((goal) => {
            const progress = Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
            const isComplete = progress >= 100;
            const goalLabel = goalTypes.find(t => t.value === goal.goal_type)?.label || goal.goal_type;
            
            return (
              <Card key={goal.id} className={`border-gold/10 bg-card/50 ${isComplete ? 'ring-2 ring-green-500/30' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-display text-foreground">{goalLabel}</CardTitle>
                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                      isComplete ? 'bg-green-500/20 text-green-400' : 'bg-gold/20 text-gold'
                    }`}>
                      {goal.period}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {goal.current_value} / {goal.target_value}
                    </span>
                    <span className={isComplete ? 'text-green-400 font-semibold' : 'text-gold'}>
                      {progress}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {!isComplete && (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Update progress"
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            updateProgress(goal.id, parseFloat(input.value));
                            input.value = '';
                          }
                        }}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-gold/30 text-gold hover:bg-gold/10"
                        onClick={() => updateProgress(goal.id, goal.current_value + 1)}
                      >
                        +1
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Goals;
