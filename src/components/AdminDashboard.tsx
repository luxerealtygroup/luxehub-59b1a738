import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, DollarSign, Users, TrendingUp, Target, Loader2, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

interface AgentData {
  id: string;
  full_name: string | null;
  closedDeals: number;
  activeDeals: number;
  totalGci: number;
  pendingGci: number;
  companyCut: number;
  pipelineClients: number;
}

interface CompanyStats {
  totalGci: number;
  pendingGci: number;
  totalCompanyCut: number;
  totalDeals: number;
  closedDeals: number;
  activeDeals: number;
  totalPipelineClients: number;
  agents: AgentData[];
}

const COLORS = ['hsl(43, 74%, 49%)', 'hsl(142, 71%, 45%)', 'hsl(217, 91%, 60%)', 'hsl(280, 67%, 60%)', 'hsl(350, 89%, 60%)'];

const AdminDashboard = () => {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading || !isAdmin) return;

    const fetchCompanyData = async () => {
      setLoading(true);

      // Fetch all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name');

      // Fetch all deals
      const { data: deals } = await supabase
        .from('deals')
        .select('*');

      // Fetch all commissions
      const { data: commissions } = await supabase
        .from('commissions')
        .select('*');

      // Fetch all pipeline clients
      const { data: pipelineClients } = await supabase
        .from('pipeline_clients')
        .select('*');

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unknown Agent']));
      const agentIds = new Set([
        ...(deals || []).map(d => d.user_id),
        ...(commissions || []).map(c => c.user_id),
        ...(pipelineClients || []).map(p => p.user_id),
      ]);

      const agentData: AgentData[] = Array.from(agentIds).map(agentId => {
        const agentDeals = (deals || []).filter(d => d.user_id === agentId);
        const agentCommissions = (commissions || []).filter(c => c.user_id === agentId);
        const agentPipeline = (pipelineClients || []).filter(p => p.user_id === agentId);

        const closedDeals = agentDeals.filter(d => d.stage === 'closed').length;
        const activeDeals = agentDeals.filter(d => ['lead', 'contacted', 'showing', 'offer', 'under_contract'].includes(d.stage)).length;

        const totalGci = agentCommissions
          .filter(c => c.status === 'paid')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        const pendingGci = agentCommissions
          .filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        // Calculate company cut from deals
        const companyCut = agentDeals
          .filter(d => d.stage === 'closed')
          .reduce((sum, d) => {
            const dealValue = Number(d.deal_value || 0);
            const commissionRate = Number(d.commission_rate || 3) / 100;
            const companySplit = Number(d.company_split_percentage || 30) / 100;
            return sum + (dealValue * commissionRate * companySplit);
          }, 0);

        return {
          id: agentId,
          full_name: profilesMap.get(agentId) || 'Unknown Agent',
          closedDeals,
          activeDeals,
          totalGci,
          pendingGci,
          companyCut,
          pipelineClients: agentPipeline.length,
        };
      });

      const companyStats: CompanyStats = {
        totalGci: agentData.reduce((sum, a) => sum + a.totalGci, 0),
        pendingGci: agentData.reduce((sum, a) => sum + a.pendingGci, 0),
        totalCompanyCut: agentData.reduce((sum, a) => sum + a.companyCut, 0),
        totalDeals: (deals || []).length,
        closedDeals: (deals || []).filter(d => d.stage === 'closed').length,
        activeDeals: (deals || []).filter(d => ['lead', 'contacted', 'showing', 'offer', 'under_contract'].includes(d.stage)).length,
        totalPipelineClients: (pipelineClients || []).length,
        agents: agentData.sort((a, b) => b.totalGci - a.totalGci),
      };

      setStats(companyStats);
      setLoading(false);
    };

    fetchCompanyData();
  }, [isAdmin, roleLoading]);

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

  if (!stats) return null;

  const agentGciData = stats.agents.map(a => ({
    name: a.full_name?.split(' ')[0] || 'Agent',
    gci: a.totalGci,
    pending: a.pendingGci,
  }));

  const agentDealsData = stats.agents.map(a => ({
    name: a.full_name?.split(' ')[0] || 'Agent',
    closed: a.closedDeals,
    active: a.activeDeals,
  }));

  const selectedAgentData = selectedAgent ? stats.agents.find(a => a.id === selectedAgent) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Company Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all agent performance and company revenue</p>
        </div>
        <Badge variant="outline" className="border-gold text-gold">
          {stats.agents.length} Agents
        </Badge>
      </div>

      {/* Company-wide Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Total GCI Earned</span>
            </div>
            <p className="text-3xl font-bold text-foreground">${stats.totalGci.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Across all agents</p>
          </CardContent>
        </Card>

        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-gold" />
              <span className="text-sm text-muted-foreground">Pending GCI</span>
            </div>
            <p className="text-3xl font-bold text-gold">${stats.pendingGci.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting close</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Company Revenue</span>
            </div>
            <p className="text-3xl font-bold text-blue-500">${stats.totalCompanyCut.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">From closed deals</p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-gradient-to-br from-card to-purple-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">Pipeline Clients</span>
            </div>
            <p className="text-3xl font-bold text-purple-500">{stats.totalPipelineClients}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.closedDeals} closed / {stats.activeDeals} active deals</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agent Breakdown</TabsTrigger>
          <TabsTrigger value="pipeline">Pipelines</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GCI by Agent Chart */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" /> GCI by Agent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentGciData}>
                      <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      />
                      <Bar dataKey="gci" name="Earned" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending" name="Pending" fill="hsl(43 74% 49%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Deals by Agent Chart */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display flex items-center gap-2">
                  <Target className="h-5 w-5" /> Deals by Agent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentDealsData}>
                      <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                      <Bar dataKey="closed" name="Closed" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="active" name="Active" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.agents.map((agent, idx) => (
              <Card
                key={agent.id}
                className={`border-gold/10 cursor-pointer transition-all hover:border-gold/30 ${selectedAgent === agent.id ? 'border-gold ring-1 ring-gold' : ''}`}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="font-medium text-foreground">{agent.full_name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      #{idx + 1}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">GCI Earned</p>
                      <p className="font-semibold text-green-500">${agent.totalGci.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pending</p>
                      <p className="font-semibold text-gold">${agent.pendingGci.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Closed Deals</p>
                      <p className="font-semibold">{agent.closedDeals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Active Deals</p>
                      <p className="font-semibold">{agent.activeDeals}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Company Cut</span>
                      <span className="font-semibold text-blue-500">${agent.companyCut.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedAgentData && (
            <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
              <CardHeader>
                <CardTitle className="text-gold font-display">
                  {selectedAgentData.full_name} - Detailed View
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-green-500">${selectedAgentData.totalGci.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Total GCI Earned</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gold">${selectedAgentData.pendingGci.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Pending GCI</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{selectedAgentData.closedDeals + selectedAgentData.activeDeals}</p>
                    <p className="text-sm text-muted-foreground">Total Deals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-purple-500">{selectedAgentData.pipelineClients}</p>
                    <p className="text-sm text-muted-foreground">Pipeline Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Card className="border-gold/10">
            <CardHeader>
              <CardTitle className="text-gold font-display">Pipeline Overview by Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.agents.map((agent, idx) => {
                  const totalPipeline = agent.pipelineClients;
                  const maxPipeline = Math.max(...stats.agents.map(a => a.pipelineClients)) || 1;
                  const percentage = (totalPipeline / maxPipeline) * 100;

                  return (
                    <div key={agent.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <span className="font-medium text-foreground">{agent.full_name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{agent.pipelineClients} clients</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
