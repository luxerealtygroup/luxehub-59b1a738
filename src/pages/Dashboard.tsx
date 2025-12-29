import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Phone, DollarSign, Target, Users, Search, Loader2, TrendingUp, Flame, Award, ArrowUp, CheckCircle, Clock } from 'lucide-react';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { followUpBossApi, FUBPerson } from '@/lib/api/followUpBoss';
import GoogleCalendarWidget from '@/components/GoogleCalendarWidget';
import FUBSmartLists from '@/components/FUBSmartLists';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface Stats {
  totalDeals: number;
  activeDeals: number;
  totalCommissions: number;
  pendingCommissions: number;
  activitiesThisWeek: number;
  goalsProgress: number;
  dealsGoal: number;
  gciGoal: number;
  closedDeals: number;
}

interface MonthlyData {
  month: string;
  gci: number;
}

const stageDefinitions: Record<number, { description: string }> = {
  10: { description: 'Next 30 days' },
  9: { description: 'Next 60 days' },
  8: { description: 'Next 90 days' },
  7: { description: 'Next 120 days' },
  6: { description: 'Next 6 months' },
  5: { description: 'Next 9 months' },
  4: { description: 'Next 12 months' },
  3: { description: '12-18 months' },
  2: { description: '18-24 months' },
  1: { description: '24+ months' },
};

const stageOrder = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = 2026;

// Circular Progress Ring Component
const ProgressRing = ({ progress, size = 120, strokeWidth = 8, color = "hsl(var(--gold))" }: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    totalDeals: 0,
    activeDeals: 0,
    totalCommissions: 0,
    pendingCommissions: 0,
    activitiesThisWeek: 0,
    goalsProgress: 0,
    dealsGoal: 0,
    gciGoal: 0,
    closedDeals: 0
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fubClients, setFubClients] = useState<FUBPerson[]>([]);
  const [fubLoading, setFubLoading] = useState(false);
  const [fubError, setFubError] = useState<string | null>(null);
  
  // Add client dialog state
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(true);
  const [newClient, setNewClient] = useState({
    client_name: '',
    email: '',
    phone: '',
    stage: '5',
    notes: '',
    property_interest: '',
    source: ''
  });

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [dealsRes, commissionsRes, activitiesRes, goalsRes] = await Promise.all([
        supabase.from('deals').select('*').eq('user_id', user.id),
        supabase.from('commissions').select('gross_commission, amount, status, paid_at').eq('user_id', user.id),
        supabase.from('agent_activities').select('*').eq('user_id', user.id),
        supabase.from('agent_goals').select('*').eq('user_id', user.id).eq('period', 'yearly')
      ]);

      const deals = dealsRes.data || [];
      const commissions = commissionsRes.data || [];
      const goals = goalsRes.data || [];

      const activeStages = ['lead', 'contacted', 'showing', 'offer', 'under_contract'];
      const activeDeals = deals.filter(d => activeStages.includes(d.stage));
      const closedDeals = deals.filter(d => d.stage === 'closed').length;
      
      // Use gross_commission for totals (fallback to amount if not available)
      const totalCommissions = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);
      
      const pendingCommissions = commissions
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

      // Get goals
      const dealsGoal = goals.find(g => g.goal_type === 'deals_closed')?.target_value || 0;
      const gciGoal = goals.find(g => g.goal_type === 'revenue')?.target_value || 0;

      const avgGoalProgress = goals.length > 0
        ? goals.reduce((sum, g) => sum + (Number(g.current_value) / Number(g.target_value) * 100), 0) / goals.length
        : 0;

      // Calculate monthly GCI data for chart
      const monthlyGci = monthNames.map((month, idx) => {
        const monthCommissions = commissions.filter(c => {
          if (!c.paid_at) return false;
          const date = new Date(c.paid_at);
          return date.getFullYear() === currentYear && date.getMonth() === idx;
        });
        return {
          month,
          gci: monthCommissions.reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0)
        };
      });
      setMonthlyData(monthlyGci);

      setStats({
        totalDeals: deals.length,
        activeDeals: activeDeals.length,
        totalCommissions,
        pendingCommissions,
        activitiesThisWeek: (activitiesRes.data || []).length,
        goalsProgress: Math.round(avgGoalProgress),
        dealsGoal: Number(dealsGoal),
        gciGoal: Number(gciGoal),
        closedDeals
      });
      setLoading(false);
    };

    const fetchFUBClients = async () => {
      setFubLoading(true);
      setFubError(null);
      try {
        const response = await followUpBossApi.getPeople(10);
        if (response.success && response.data?.people) {
          setFubClients(response.data.people);
        } else {
          setFubError(response.error || 'Could not load Follow Up Boss clients');
        }
      } catch (error) {
        console.error('FUB error:', error);
        setFubError('Failed to connect to Follow Up Boss');
      } finally {
        setFubLoading(false);
      }
    };

    fetchStats();
    fetchFUBClients();

    // Auto-refresh FUB data every 3 minutes
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing FUB data...');
      fetchFUBClients();
    }, 3 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [user]);

  const syncClientToFUB = async (clientData: typeof newClient) => {
    try {
      const nameParts = clientData.client_name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const stageNum = parseInt(clientData.stage);
      const stageTag = `pipeline_stage_${stageNum}`;
      const timelineTag = `timeline_${stageDefinitions[stageNum]?.description || 'unknown'}`;
      
      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_person',
          params: {
            firstName,
            lastName,
            email: clientData.email || undefined,
            phone: clientData.phone || undefined,
            source: clientData.source || 'Lovable Pipeline',
            tags: [stageTag, timelineTag, 'pipeline_client'],
            notes: [clientData.notes, clientData.property_interest].filter(Boolean).join(' | ')
          }
        }
      });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error syncing to FUB:', error);
      return { success: false, error };
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSubmitting(true);

    const { error } = await supabase.from('pipeline_clients').insert({
      user_id: user.id,
      client_name: newClient.client_name,
      email: newClient.email || null,
      phone: newClient.phone || null,
      stage: parseInt(newClient.stage),
      notes: newClient.notes || null,
      property_interest: newClient.property_interest || null,
      source: newClient.source || null
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    
    if (syncToFUB) {
      const fubResult = await syncClientToFUB(newClient);
      if (fubResult.success) {
        toast({ title: 'Client added & synced to Follow Up Boss!' });
      } else {
        toast({ 
          title: 'Client added to pipeline', 
          description: 'Note: Could not sync to Follow Up Boss',
        });
      }
    } else {
      toast({ title: 'Client added to pipeline!' });
    }
    
    setAddClientOpen(false);
    setNewClient({ client_name: '', email: '', phone: '', stage: '5', notes: '', property_interest: '', source: '' });
    setSyncToFUB(true);
    setSubmitting(false);
  };

  const handleFUBClientSelect = (client: { name: string; email?: string; phone?: string }) => {
    setNewClient({
      ...newClient,
      client_name: client.name,
      email: client.email || newClient.email,
      phone: client.phone || newClient.phone,
      source: 'Follow Up Boss'
    });
  };

  // Calculate progress percentages
  const dealsProgress = stats.dealsGoal > 0 ? (stats.closedDeals / stats.dealsGoal) * 100 : 0;
  const gciProgress = stats.gciGoal > 0 ? (stats.totalCommissions / stats.gciGoal) * 100 : 0;

  // Motivational message based on progress
  const getMotivationalMessage = () => {
    const avg = (dealsProgress + gciProgress) / 2;
    if (avg >= 100) return { icon: Award, text: "Outstanding! You've crushed your goals! 🏆", color: "text-green-500" };
    if (avg >= 75) return { icon: Flame, text: "You're on fire! Keep pushing to hit your targets!", color: "text-orange-500" };
    if (avg >= 50) return { icon: TrendingUp, text: "Great momentum! You're halfway to your goals!", color: "text-gold" };
    if (avg >= 25) return { icon: ArrowUp, text: "Building momentum! Every deal counts!", color: "text-blue-500" };
    return { icon: Target, text: "Start strong! Your next deal is waiting!", color: "text-muted-foreground" };
  };

  const motivation = getMotivationalMessage();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gold animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Daily Motivation Quote - TOP */}
      <Card className="border-gold/10 bg-gradient-to-br from-card to-gold/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-gold font-display flex items-center gap-2">
            <Flame className="h-5 w-5" /> Daily Motivation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic">
            "Success in real estate comes from building relationships one conversation at a time. Make those calls, set those appointments, and watch your business grow!"
          </p>
          <div className="mt-4 p-3 rounded-lg bg-gold/10 border border-gold/20">
            <p className="text-sm text-foreground font-medium">💡 Pro Tip</p>
            <p className="text-xs text-muted-foreground mt-1">
              Agents who log their activities daily close 40% more deals. Keep tracking to stay ahead!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Combined Progress Rings - SECOND */}
      <Card className="border-gold/20 bg-gradient-to-br from-card via-card to-gold/5">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-around gap-8">
            <div className="text-center">
              <ProgressRing progress={dealsProgress} color={dealsProgress >= 100 ? "hsl(142 71% 45%)" : "hsl(var(--gold))"} />
              <p className="mt-3 text-sm font-medium text-foreground">Deals Goal</p>
              <p className="text-xs text-muted-foreground">{stats.closedDeals} / {stats.dealsGoal}</p>
            </div>
            <div className="text-center">
              <ProgressRing progress={gciProgress} color={gciProgress >= 100 ? "hsl(142 71% 45%)" : "hsl(var(--gold))"} />
              <p className="mt-3 text-sm font-medium text-foreground">GCI Goal (Gross)</p>
              <p className="text-xs text-muted-foreground">${stats.totalCommissions.toLocaleString()} / ${stats.gciGoal.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <ProgressRing 
                progress={stats.gciGoal > 0 ? ((stats.totalCommissions + stats.pendingCommissions) / stats.gciGoal) * 100 : 0} 
                color="hsl(43 74% 49%)" 
              />
              <p className="mt-3 text-sm font-medium text-foreground">Projected GCI</p>
              <p className="text-xs text-muted-foreground">${(stats.totalCommissions + stats.pendingCommissions).toLocaleString()} total</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions - THIRD */}
      <Card className="border-gold/10 bg-card/50">
        <CardHeader>
          <CardTitle className="text-gold font-display">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/dashboard/activities" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center group">
            <Phone className="h-6 w-6 mx-auto text-gold mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-foreground">Log Activity</span>
          </a>
          <a href="/dashboard/pipeline" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center group">
            <Users className="h-6 w-6 mx-auto text-gold mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-foreground">View Pipeline</span>
          </a>
          <a href="/dashboard/commissions" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center group">
            <DollarSign className="h-6 w-6 mx-auto text-gold mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-foreground">Commissions</span>
          </a>
          <a href="/dashboard/goals" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center group">
            <Target className="h-6 w-6 mx-auto text-gold mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-foreground">Set Goals</span>
          </a>
        </CardContent>
      </Card>

      {/* Header with Add Client Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
          </h1>
          <div className={`flex items-center gap-2 mt-2 ${motivation.color}`}>
            <motivation.icon className="h-5 w-5" />
            <p className="font-medium">{motivation.text}</p>
          </div>
        </div>
        <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-primary-foreground hover:bg-gold/90 shadow-gold">
              <Users className="h-4 w-4 mr-2" /> Add New Client
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card max-w-md">
            <DialogHeader>
              <DialogTitle className="text-primary font-display">Add Client to Pipeline</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Client name *"
                  value={newClient.client_name}
                  onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })}
                  required
                  className="flex-1"
                />
                <FUBClientSearch 
                  onSelectClient={handleFUBClientSelect}
                  trigger={
                    <Button type="button" variant="outline" size="icon" title="Import from Follow Up Boss">
                      <Search className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
                <Input
                  type="tel"
                  placeholder="Phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Buying Timeline Stage</Label>
                <Select value={newClient.stage} onValueChange={(v) => setNewClient({ ...newClient, stage: v })}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stageOrder.map(s => (
                      <SelectItem key={s} value={s.toString()}>
                        Stage {s} - {stageDefinitions[s].description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Property interest (e.g., 3BR in Downtown)"
                value={newClient.property_interest}
                onChange={(e) => setNewClient({ ...newClient, property_interest: e.target.value })}
              />
              <Input
                placeholder="Source (e.g., Referral, Open House)"
                value={newClient.source}
                onChange={(e) => setNewClient({ ...newClient, source: e.target.value })}
              />
              <Textarea
                placeholder="Notes"
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                rows={3}
              />
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="sync-fub-dashboard" 
                  checked={syncToFUB} 
                  onCheckedChange={(checked) => setSyncToFUB(checked === true)}
                />
                <Label htmlFor="sync-fub-dashboard" className="text-sm text-muted-foreground cursor-pointer">
                  Also add to Follow Up Boss
                </Label>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {syncToFUB ? 'Adding & Syncing...' : 'Adding...'}
                  </>
                ) : (
                  'Add Client'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Deals Progress - Closed vs Active */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-card via-card to-green-500/5 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Closed Deals</h3>
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.closedDeals}</p>
            <p className="text-xs text-muted-foreground mt-1">of {stats.dealsGoal} goal</p>
            <Progress value={dealsProgress} className="h-2 mt-3" />
            <p className="text-xs text-green-500 mt-1">{Math.round(dealsProgress)}% complete</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-card via-card to-amber-500/5 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Active Deals</h3>
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.activeDeals}</p>
            <p className="text-xs text-muted-foreground mt-1">in pipeline</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 text-xs">
                {stats.totalDeals} total deals
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-gradient-to-br from-card via-card to-green-500/5 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Earned GCI (Gross)</h3>
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">${stats.totalCommissions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">of ${stats.gciGoal.toLocaleString()} goal</p>
            <Progress value={gciProgress} className="h-2 mt-3" />
            <p className="text-xs text-green-500 mt-1">{Math.round(gciProgress)}% complete</p>
          </CardContent>
        </Card>

        <Card className="border-gold/20 bg-gradient-to-br from-card via-card to-gold/5 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gold" />
                <h3 className="text-sm font-medium text-muted-foreground">Pending GCI (Gross)</h3>
              </div>
            </div>
            <p className="text-3xl font-bold text-gold">${stats.pendingCommissions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">awaiting close</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="border-gold/30 text-gold bg-gold/10 text-xs">
                ${(stats.totalCommissions + stats.pendingCommissions).toLocaleString()} total
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GCI Trend Chart */}
      <Card className="border-gold/20 bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gold" />
            {currentYear} GCI Trend (Gross)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="gciGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43 74% 49%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(43 74% 49%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Gross GCI']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="gci" 
                  stroke="hsl(43 74% 49%)" 
                  strokeWidth={2}
                  fill="url(#gciGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-gold/10 bg-card/50 hover:border-gold/30 transition-colors">
          <CardContent className="p-4 text-center">
            <Phone className="h-8 w-8 mx-auto text-gold mb-2" />
            <p className="text-2xl font-bold text-foreground">{stats.activitiesThisWeek}</p>
            <p className="text-xs text-muted-foreground">Activities Logged</p>
          </CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50 hover:border-gold/30 transition-colors">
          <CardContent className="p-4 text-center">
            <Target className="h-8 w-8 mx-auto text-gold mb-2" />
            <p className="text-2xl font-bold text-foreground">{stats.goalsProgress}%</p>
            <p className="text-xs text-muted-foreground">Goals Progress</p>
          </CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50 hover:border-gold/30 transition-colors">
          <CardContent className="p-4 text-center">
            <Building2 className="h-8 w-8 mx-auto text-gold mb-2" />
            <p className="text-2xl font-bold text-foreground">{stats.totalDeals}</p>
            <p className="text-xs text-muted-foreground">Total Deals</p>
          </CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50 hover:border-gold/30 transition-colors">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-green-500">${stats.pendingCommissions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Pending GCI</p>
          </CardContent>
        </Card>
      </div>

      {/* Google Calendar, Smart Lists & Follow Up Boss Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GoogleCalendarWidget />
        <FUBSmartLists />
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gold" />
              <CardTitle className="text-gold font-display">FUB Clients</CardTitle>
            </div>
            <FUBClientSearch 
              onSelectClient={(client) => console.log('Selected:', client)}
              trigger={
                <Button variant="outline" size="sm" className="border-gold/30 text-gold hover:bg-gold/10">
                  <Search className="h-4 w-4" />
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {fubLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-gold animate-spin" />
              </div>
            ) : fubError ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">{fubError}</p>
              </div>
            ) : fubClients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 mx-auto text-gold/30 mb-2" />
                <p className="text-muted-foreground">No clients found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {fubClients.slice(0, 6).map((client) => (
                  <div 
                    key={client.id}
                    className="p-3 rounded-lg bg-gold/5 border border-gold/10 hover:border-gold/30 transition-colors"
                  >
                    <p className="font-medium text-foreground truncate text-sm">
                      {client.name || `${client.firstName} ${client.lastName}`}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground truncate">
                        {client.emails?.[0]?.value || client.phones?.[0]?.value || 'No contact'}
                      </span>
                      {client.stage && (
                        <Badge variant="outline" className="text-xs border-gold/30 text-gold">
                          {client.stage}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
