import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, Users, DollarSign, Target, TrendingUp, Phone, 
  Calendar, FileText, Loader2, User 
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface AgentProfileData {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface PipelineClient {
  id: string;
  client_name: string;
  client_type: string;
  stage: number;
  status: string | null;
  projected_sale_amount: number;
  projected_gci: number;
  expected_pending_date: string | null;
  source: string | null;
  created_at: string;
}

interface Deal {
  id: string;
  client_name: string;
  property_address: string | null;
  deal_value: number;
  stage: string;
  expected_close_date: string | null;
  commission_rate: number;
  source: string | null;
  created_at: string;
}

interface Commission {
  id: string;
  amount: number;
  gross_commission: number;
  status: string;
  deal_id: string;
  created_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  client_name: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ProductionGoal {
  annual_units_goal: number | null;
  annual_gci_goal: number | null;
  annual_volume_goal: number | null;
}

const COLORS = ['hsl(43, 74%, 49%)', 'hsl(142, 71%, 45%)', 'hsl(217, 91%, 60%)', 'hsl(280, 67%, 60%)', 'hsl(350, 89%, 60%)'];

const stageLabels: Record<number, string> = {
  1: 'Hot Lead',
  2: 'Showing',
  3: 'Under Contract',
  4: 'Pending',
  5: 'New Lead',
  6: 'Active Search',
  7: 'Pre-Approval',
  8: 'Making Offers',
  9: 'Appointment Held',
};

const AgentProfile = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  
  const [agent, setAgent] = useState<AgentProfileData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineClient[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [goals, setGoals] = useState<ProductionGoal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading || !isAdmin || !agentId) return;

    const fetchAgentData = async () => {
      setLoading(true);

      // Fetch agent profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', agentId)
        .maybeSingle();
      
      setAgent(profileData);

      // Fetch pipeline clients
      const { data: pipelineData } = await supabase
        .from('pipeline_clients')
        .select('*')
        .eq('user_id', agentId)
        .order('created_at', { ascending: false });
      
      setPipeline(pipelineData || []);

      // Fetch deals
      const { data: dealsData } = await supabase
        .from('deals')
        .select('*')
        .eq('user_id', agentId)
        .order('created_at', { ascending: false });
      
      setDeals(dealsData || []);

      // Fetch commissions
      const { data: commissionsData } = await supabase
        .from('commissions')
        .select('*')
        .eq('user_id', agentId)
        .order('created_at', { ascending: false });
      
      setCommissions(commissionsData || []);

      // Fetch activities
      const { data: activitiesData } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('user_id', agentId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      setActivities(activitiesData || []);

      // Fetch goals
      const currentYear = new Date().getFullYear();
      const { data: goalsData } = await supabase
        .from('production_goals')
        .select('annual_units_goal, annual_gci_goal, annual_volume_goal')
        .eq('user_id', agentId)
        .eq('year', currentYear)
        .maybeSingle();
      
      setGoals(goalsData);

      setLoading(false);
    };

    fetchAgentData();
  }, [agentId, isAdmin, roleLoading]);

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="p-8 text-center">
          <p className="text-destructive">Access denied. Admin privileges required.</p>
        </CardContent>
      </Card>
    );
  }

  if (!agent) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Agent not found.</p>
          <Button onClick={() => navigate('/dashboard/admin')} className="mt-4">
            Back to Admin Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Calculate metrics
  const totalPipelineValue = pipeline.reduce((sum, c) => sum + Number(c.projected_sale_amount || 0), 0);
  const totalPipelineGci = pipeline.reduce((sum, c) => sum + Number(c.projected_gci || 0), 0);
  const buyers = pipeline.filter(c => c.client_type === 'buyer').length;
  const sellers = pipeline.filter(c => c.client_type === 'seller').length;
  
  const closedDeals = deals.filter(d => d.stage === 'closed').length;
  const totalVolume = deals.filter(d => d.stage === 'closed').reduce((sum, d) => sum + Number(d.deal_value || 0), 0);
  
  const earnedGci = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);
  const pendingGci = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

  // Goal progress
  const dealsProgress = goals?.annual_units_goal ? (closedDeals / goals.annual_units_goal) * 100 : 0;
  const gciProgress = goals?.annual_gci_goal ? ((earnedGci + pendingGci) / Number(goals.annual_gci_goal)) * 100 : 0;
  const volumeProgress = goals?.annual_volume_goal ? (totalVolume / Number(goals.annual_volume_goal)) * 100 : 0;

  // Source breakdown
  const sourceData = pipeline.reduce((acc, client) => {
    const source = client.source || 'Unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const sourceChartData = Object.entries(sourceData).map(([name, value]) => ({ name, value }));

  // Stage breakdown
  const stageData = pipeline.reduce((acc, client) => {
    const label = stageLabels[client.stage] || `Stage ${client.stage}`;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const stageChartData = Object.entries(stageData).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/admin')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-16 w-16 border-2 border-gold/30">
          <AvatarImage src={agent.avatar_url || undefined} alt={agent.full_name || 'Agent'} />
          <AvatarFallback className="bg-gold/20 text-gold text-xl font-semibold">
            {agent.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'AG'}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">{agent.full_name || 'Unknown Agent'}</h1>
          <p className="text-muted-foreground">Agent Profile</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">GCI Earned</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{formatCurrency(earnedGci)}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(pendingGci)} pending</p>
          </CardContent>
        </Card>

        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-gold" />
              <span className="text-sm text-muted-foreground">Closed Deals</span>
            </div>
            <p className="text-2xl font-bold text-gold">{closedDeals}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(totalVolume)} volume</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Pipeline</span>
            </div>
            <p className="text-2xl font-bold text-blue-500">{pipeline.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{buyers} buyers / {sellers} sellers</p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-gradient-to-br from-card to-purple-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">Pipeline Value</span>
            </div>
            <p className="text-2xl font-bold text-purple-500">{formatCurrency(totalPipelineGci)}</p>
            <p className="text-xs text-muted-foreground mt-1">Projected GCI</p>
          </CardContent>
        </Card>
      </div>

      {/* Goal Progress */}
      {goals && (
        <Card className="border-gold/20">
          <CardHeader>
            <CardTitle className="text-gold font-display">Goal Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Deals ({closedDeals} / {goals.annual_units_goal || 0})</span>
                  <span>{Math.round(dealsProgress)}%</span>
                </div>
                <Progress value={Math.min(dealsProgress, 100)} className="h-3" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>GCI ({formatCurrency(earnedGci + pendingGci)} / {formatCurrency(Number(goals.annual_gci_goal))})</span>
                  <span>{Math.round(gciProgress)}%</span>
                </div>
                <Progress value={Math.min(gciProgress, 100)} className="h-3" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Volume ({formatCurrency(totalVolume)} / {formatCurrency(Number(goals.annual_volume_goal))})</span>
                  <span>{Math.round(volumeProgress)}%</span>
                </div>
                <Progress value={Math.min(volumeProgress, 100)} className="h-3" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pipeline.map(client => (
              <Card key={client.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{client.client_name}</span>
                    <Badge variant={client.client_type === 'buyer' ? 'default' : 'secondary'}>
                      {client.client_type}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <span>Stage: {stageLabels[client.stage] || `Stage ${client.stage}`}</span>
                    <span>Source: {client.source || 'N/A'}</span>
                    <span>Value: {formatCurrency(client.projected_sale_amount)}</span>
                    <span>GCI: {formatCurrency(client.projected_gci)}</span>
                  </div>
                  {client.expected_pending_date && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Expected: {format(new Date(client.expected_pending_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {pipeline.length === 0 && (
              <Card className="col-span-2">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No pipeline clients found
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="deals" className="space-y-4">
          <div className="space-y-3">
            {deals.map(deal => (
              <Card key={deal.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{deal.client_name}</span>
                    <Badge variant={deal.stage === 'closed' ? 'default' : 'outline'}>
                      {deal.stage}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{deal.property_address || 'No address'}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-green-500">{formatCurrency(deal.deal_value)}</span>
                    <span className="text-muted-foreground">{deal.commission_rate}% commission</span>
                    {deal.source && <span className="text-muted-foreground">Source: {deal.source}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {deals.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No deals found
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <div className="space-y-3">
            {activities.map(activity => (
              <Card key={activity.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{activity.activity_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {activity.client_name && (
                    <p className="font-medium">{activity.client_name}</p>
                  )}
                  {activity.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{activity.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {activities.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No activities found
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Source Breakdown */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display">Pipeline by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {sourceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sourceChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {sourceChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stage Breakdown */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display">Pipeline by Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {stageChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageChartData} layout="vertical">
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={100} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                        <Bar dataKey="value" fill="hsl(43 74% 49%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AgentProfile;
