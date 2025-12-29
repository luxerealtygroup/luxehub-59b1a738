import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { followUpBossApi, FUBDeal, FUBDealUser } from '@/lib/api/followUpBoss';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, DollarSign, Users, TrendingUp, Target, Loader2, BarChart3, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, Legend } from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';
import TeamGoals from './TeamGoals';

interface AgentData {
  id: string;
  full_name: string | null;
  closedDeals: number;
  activeDeals: number;
  totalGci: number;
  pendingGci: number;
  companyCut: number;
  pipelineClients: number;
  pipelineGci: number;
  // Goals
  dealsGoal: number;
  gciGoal: number;
  volumeGoal: number;
}

interface CompanyStats {
  totalGci: number;
  pendingGci: number;
  totalCompanyCut: number;
  totalDeals: number;
  closedDeals: number;
  activeDeals: number;
  totalPipelineClients: number;
  totalPipelineGci: number;
  agents: AgentData[];
}

interface FUBStats {
  totalGci: number;
  pendingGci: number;
  companyRevenueEarned: number;
  companyRevenuePending: number;
  closedDeals: number;
  pendingDeals: number;
}

interface FUBAgentStats {
  id: number;
  name: string;
  picture?: string;
  totalGci: number;
  pendingGci: number;
  teamCommission: number;
  dealCount: number;
}

interface MonthlyRevenueData {
  month: string;
  monthLabel: string;
  earned: number;
  pending: number;
}

interface MonthlyPipelineData {
  month: string;
  monthLabel: string;
  buyers: number;
  sellers: number;
  total: number;
  projectedGci: number;
}

interface TeamPipelineSummary {
  totalClients: number;
  totalBuyers: number;
  totalSellers: number;
  totalProjectedGci: number;
  totalDealsGoal: number;
  totalGciGoal: number;
}

const COLORS = ['hsl(43, 74%, 49%)', 'hsl(142, 71%, 45%)', 'hsl(217, 91%, 60%)', 'hsl(280, 67%, 60%)', 'hsl(350, 89%, 60%)'];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [fubStats, setFubStats] = useState<FUBStats | null>(null);
  const [fubAgents, setFubAgents] = useState<FUBAgentStats[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenueData[]>([]);
  const [monthlyPipeline, setMonthlyPipeline] = useState<MonthlyPipelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    if (roleLoading || !isAdmin) return;

    const fetchCompanyData = async () => {
      setLoading(true);

      // Fetch FUB deals for company-wide stats
      const fubResponse = await followUpBossApi.getDeals(200, 0);
      if (fubResponse.success && fubResponse.data?.deals) {
        const deals = fubResponse.data.deals;
        
        // Closed deals = status is "Won" or similar closed status
        const closedDeals = deals.filter((d: FUBDeal) => 
          d.status?.toLowerCase() === 'won' || 
          d.stageName?.toLowerCase().includes('closed') ||
          d.stageName?.toLowerCase().includes('won')
        );
        
        // Pending deals = only deals with stage "Pending" (under contract awaiting close)
        const pendingDeals = deals.filter((d: FUBDeal) => 
          d.stageName?.toLowerCase() === 'pending'
        );
        
        // Active deals = everything else that's not closed/won/lost
        const activeDeals = deals.filter((d: FUBDeal) => 
          d.status?.toLowerCase() !== 'won' && 
          d.status?.toLowerCase() !== 'lost' &&
          !d.stageName?.toLowerCase().includes('closed') &&
          !d.stageName?.toLowerCase().includes('won') &&
          d.stageName?.toLowerCase() !== 'pending'
        );

        // Total GCI = full commission value from closed deals (no splits)
        const totalGci = closedDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.commissionValue || 0), 0
        );

        // Pending GCI = full commission value from pending deals (no splits)
        const pendingGci = pendingDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.commissionValue || 0), 0
        );

        // Company Revenue Earned = teamCommission from closed deals
        const companyRevenueEarned = closedDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.teamCommission || 0), 0
        );

        // Company Revenue Pending = teamCommission from pending deals
        const companyRevenuePending = pendingDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.teamCommission || 0), 0
        );

        setFubStats({
          totalGci,
          pendingGci,
          companyRevenueEarned,
          companyRevenuePending,
          closedDeals: closedDeals.length,
          pendingDeals: pendingDeals.length,
        });

        // Build agent leaderboard from FUB deals
        const agentMap = new Map<number, FUBAgentStats>();
        deals.forEach((deal: FUBDeal) => {
          deal.users?.forEach((user: FUBDealUser) => {
            const existing = agentMap.get(user.id) || {
              id: user.id,
              name: user.name,
              picture: user.picture?.['60x60'] || user.picture?.original,
              totalGci: 0,
              pendingGci: 0,
              teamCommission: 0,
              dealCount: 0,
            };
            
            const isClosedDeal = deal.status?.toLowerCase() === 'won' || 
              deal.stageName?.toLowerCase().includes('closed') ||
              deal.stageName?.toLowerCase().includes('won');
            const isPendingDeal = deal.stageName?.toLowerCase() === 'pending';
            
            if (isClosedDeal) {
              existing.totalGci += deal.commissionValue || 0;
              existing.teamCommission += deal.teamCommission || 0;
              existing.dealCount += 1;
            } else if (isPendingDeal) {
              existing.pendingGci += deal.commissionValue || 0;
              existing.teamCommission += deal.teamCommission || 0;
              existing.dealCount += 1;
            }
            
            agentMap.set(user.id, existing);
          });
        });
        
        const sortedAgents = Array.from(agentMap.values())
          .sort((a, b) => (b.totalGci + b.pendingGci) - (a.totalGci + a.pendingGci));
        setFubAgents(sortedAgents);

        // Build monthly revenue data from FUB deals
        const revenueByMonth = new Map<string, { earned: number; pending: number }>();
        deals.forEach((deal: FUBDeal) => {
          const closeDate = deal.projectedCloseDate || deal.createdAt;
          if (!closeDate) return;
          
          const monthKey = format(startOfMonth(parseISO(closeDate)), 'yyyy-MM');
          const existing = revenueByMonth.get(monthKey) || { earned: 0, pending: 0 };
          
          const isClosedDeal = deal.status?.toLowerCase() === 'won' || 
            deal.stageName?.toLowerCase().includes('closed') ||
            deal.stageName?.toLowerCase().includes('won');
          const isPendingDeal = deal.stageName?.toLowerCase() === 'pending';
          
          if (isClosedDeal) {
            existing.earned += deal.teamCommission || 0;
          } else if (isPendingDeal) {
            existing.pending += deal.teamCommission || 0;
          }
          
          revenueByMonth.set(monthKey, existing);
        });
        
        const monthlyRevenueData = Array.from(revenueByMonth.entries())
          .map(([month, data]) => ({
            month,
            monthLabel: format(parseISO(month + '-01'), 'MMM yyyy'),
            earned: data.earned,
            pending: data.pending,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));
        setMonthlyRevenue(monthlyRevenueData);
      }

      // Fetch all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name');

      // Fetch all deals from local DB for agent breakdown
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

      // Fetch agent production goals for the current year
      const { data: productionGoals } = await supabase
        .from('production_goals')
        .select('*')
        .eq('year', 2026);

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unknown Agent']));
      const goalsMap = new Map((productionGoals || []).map(g => [g.user_id, g]));
      
      const agentIds = new Set([
        ...(deals || []).map(d => d.user_id),
        ...(commissions || []).map(c => c.user_id),
        ...(pipelineClients || []).map(p => p.user_id),
      ]);

      const agentData: AgentData[] = Array.from(agentIds).map(agentId => {
        const agentDeals = (deals || []).filter(d => d.user_id === agentId);
        const agentCommissions = (commissions || []).filter(c => c.user_id === agentId);
        const agentPipeline = (pipelineClients || []).filter(p => p.user_id === agentId);
        const agentGoals = goalsMap.get(agentId);

        const closedDeals = agentDeals.filter(d => d.stage === 'closed').length;
        const activeDeals = agentDeals.filter(d => ['lead', 'contacted', 'showing', 'offer', 'under_contract'].includes(d.stage)).length;

        const totalGci = agentCommissions
          .filter(c => c.status === 'paid')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        const pendingGci = agentCommissions
          .filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        const pipelineGci = agentPipeline
          .reduce((sum, p) => sum + Number(p.projected_gci || 0), 0);

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
          pipelineGci,
          dealsGoal: agentGoals?.annual_units_goal || 0,
          gciGoal: Number(agentGoals?.annual_gci_goal || 0),
          volumeGoal: Number(agentGoals?.annual_volume_goal || 0),
        };
      });

      // Calculate total pipeline GCI
      const totalPipelineGci = (pipelineClients || [])
        .reduce((sum, p) => sum + Number(p.projected_gci || 0), 0);

      const companyStats: CompanyStats = {
        totalGci: agentData.reduce((sum, a) => sum + a.totalGci, 0),
        pendingGci: agentData.reduce((sum, a) => sum + a.pendingGci, 0),
        totalCompanyCut: agentData.reduce((sum, a) => sum + a.companyCut, 0),
        totalDeals: (deals || []).length,
        closedDeals: (deals || []).filter(d => d.stage === 'closed').length,
        activeDeals: (deals || []).filter(d => ['lead', 'contacted', 'showing', 'offer', 'under_contract'].includes(d.stage)).length,
        totalPipelineClients: (pipelineClients || []).length,
        totalPipelineGci,
        agents: agentData.sort((a, b) => b.totalGci - a.totalGci),
      };

      setStats(companyStats);

      // Build monthly pipeline data
      const pipelineByMonth = new Map<string, { buyers: number; sellers: number; projectedGci: number }>();
      (pipelineClients || []).forEach((client: { expected_pending_date?: string; created_at: string; client_type: string; projected_gci?: number }) => {
        const targetDate = client.expected_pending_date || client.created_at;
        if (!targetDate) return;
        
        const monthKey = format(startOfMonth(parseISO(targetDate)), 'yyyy-MM');
        const existing = pipelineByMonth.get(monthKey) || { buyers: 0, sellers: 0, projectedGci: 0 };
        
        if (client.client_type === 'buyer') {
          existing.buyers += 1;
        } else {
          existing.sellers += 1;
        }
        existing.projectedGci += Number(client.projected_gci || 0);
        
        pipelineByMonth.set(monthKey, existing);
      });
      
      const monthlyPipelineData = Array.from(pipelineByMonth.entries())
        .map(([month, data]) => ({
          month,
          monthLabel: format(parseISO(month + '-01'), 'MMM yyyy'),
          buyers: data.buyers,
          sellers: data.sellers,
          total: data.buyers + data.sellers,
          projectedGci: data.projectedGci,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
      setMonthlyPipeline(monthlyPipelineData);

      setLoading(false);
    };

    fetchCompanyData();

    // Auto-refresh FUB data every 3 minutes
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing admin FUB data...');
      fetchCompanyData();
    }, 3 * 60 * 1000);

    return () => clearInterval(refreshInterval);
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

  // Agent GCI vs Goal comparison data
  const agentGciVsGoalData = stats.agents.map(a => ({
    name: a.full_name?.split(' ')[0] || 'Agent',
    actual: a.totalGci + a.pendingGci,
    goal: a.gciGoal,
    progress: a.gciGoal > 0 ? Math.round(((a.totalGci + a.pendingGci) / a.gciGoal) * 100) : 0,
  }));

  // Agent Deals vs Goal comparison data  
  const agentDealsVsGoalData = stats.agents.map(a => ({
    name: a.full_name?.split(' ')[0] || 'Agent',
    actual: a.closedDeals + a.activeDeals,
    closed: a.closedDeals,
    goal: a.dealsGoal,
    progress: a.dealsGoal > 0 ? Math.round((a.closedDeals / a.dealsGoal) * 100) : 0,
  }));

  // Agent Pipeline data with goals
  const agentPipelineData = stats.agents.map(a => ({
    name: a.full_name?.split(' ')[0] || 'Agent',
    clients: a.pipelineClients,
    pipelineGci: a.pipelineGci,
    gciGoal: a.gciGoal,
    remaining: Math.max(0, a.gciGoal - a.totalGci - a.pendingGci),
  }));

  // Team Pipeline Summary
  const teamPipelineSummary: TeamPipelineSummary = {
    totalClients: stats.totalPipelineClients,
    totalBuyers: 0, // Will be calculated from monthly data
    totalSellers: 0,
    totalProjectedGci: stats.totalPipelineGci,
    totalDealsGoal: stats.agents.reduce((sum, a) => sum + a.dealsGoal, 0),
    totalGciGoal: stats.agents.reduce((sum, a) => sum + a.gciGoal, 0),
  };

  // Legacy data for existing charts
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

      {/* Company-wide Stats from FUB */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Total GCI Earned</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              ${(fubStats?.totalGci || 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fubStats?.closedDeals || 0} closed deals from FUB
            </p>
          </CardContent>
        </Card>

        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-gold" />
              <span className="text-sm text-muted-foreground">Pending GCI</span>
            </div>
            <p className="text-3xl font-bold text-gold">
              ${(fubStats?.pendingGci || 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fubStats?.pendingDeals || 0} pending deals
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Company Revenue</span>
            </div>
            <p className="text-3xl font-bold text-blue-500">
              ${((fubStats?.companyRevenueEarned || 0) + (fubStats?.companyRevenuePending || 0)).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ${(fubStats?.companyRevenueEarned || 0).toLocaleString()} earned / ${(fubStats?.companyRevenuePending || 0).toLocaleString()} pending
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-gradient-to-br from-card to-purple-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">Pipeline Clients</span>
            </div>
            <p className="text-3xl font-bold text-purple-500">{stats?.totalPipelineClients || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.closedDeals || 0} closed / {stats?.activeDeals || 0} active deals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Team Goals */}
      <TeamGoals />

      {/* Agent Leaderboard */}
      {fubAgents.length > 0 && (
        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardHeader>
            <CardTitle className="text-gold font-display flex items-center gap-2">
              <Target className="h-5 w-5" /> Agent Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fubAgents.map((agent, idx) => (
                <div 
                  key={agent.id} 
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    idx === 0 ? 'border-gold/40 bg-gold/10' : 
                    idx === 1 ? 'border-gray-400/30 bg-gray-400/5' : 
                    idx === 2 ? 'border-amber-700/30 bg-amber-700/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-lg font-bold">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </div>
                  <Avatar className="h-12 w-12 border-2 border-gold/30">
                    <AvatarImage src={agent.picture} alt={agent.name} />
                    <AvatarFallback className="bg-gold/20 text-gold font-semibold">
                      {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{agent.name}</p>
                    <p className="text-sm text-muted-foreground">{agent.dealCount} deals</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-500">
                      ${(agent.totalGci + agent.pendingGci).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${agent.totalGci.toLocaleString()} earned / ${agent.pendingGci.toLocaleString()} pending
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agent Breakdown</TabsTrigger>
          <TabsTrigger value="pipeline">Pipelines</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Team Pipeline Summary */}
          <Card className="border-purple-500/20 bg-gradient-to-br from-card to-purple-500/5">
            <CardHeader>
              <CardTitle className="text-purple-500 font-display flex items-center gap-2">
                <Users className="h-5 w-5" /> Team Pipeline Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-purple-500/10">
                  <p className="text-3xl font-bold text-purple-500">{teamPipelineSummary.totalClients}</p>
                  <p className="text-sm text-muted-foreground">Total Pipeline Clients</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-gold/10">
                  <p className="text-3xl font-bold text-gold">${teamPipelineSummary.totalProjectedGci.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Projected Pipeline GCI</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-500/10">
                  <p className="text-3xl font-bold text-green-500">{teamPipelineSummary.totalDealsGoal}</p>
                  <p className="text-sm text-muted-foreground">Team Deals Goal</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-500/10">
                  <p className="text-3xl font-bold text-blue-500">${teamPipelineSummary.totalGciGoal.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Team GCI Goal</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GCI vs Goal by Agent Chart */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" /> Agent GCI vs Goal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentGciVsGoalData} layout="vertical">
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={80} />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      />
                      <Legend />
                      <Bar dataKey="actual" name="Actual GCI" fill="hsl(142 71% 45%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="goal" name="Goal" fill="hsl(43 74% 49% / 0.4)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Deals vs Goal by Agent Chart */}
            <Card className="border-gold/10">
              <CardHeader>
                <CardTitle className="text-gold font-display flex items-center gap-2">
                  <Target className="h-5 w-5" /> Agent Deals vs Goal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentDealsVsGoalData} layout="vertical">
                      <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={80} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                      <Legend />
                      <Bar dataKey="closed" name="Closed Deals" fill="hsl(142 71% 45%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="goal" name="Goal" fill="hsl(43 74% 49% / 0.4)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline by Agent with GCI Goals */}
          <Card className="border-purple-500/10">
            <CardHeader>
              <CardTitle className="text-purple-500 font-display flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Agent Pipeline vs GCI Goal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentPipelineData} layout="vertical">
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={80} />
                    <Tooltip
                      formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === 'remaining' ? 'Remaining to Goal' : name]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    <Legend />
                    <Bar dataKey="pipelineGci" name="Pipeline GCI" fill="hsl(280 67% 60%)" radius={[0, 4, 4, 0]} stackId="a" />
                    <Bar dataKey="remaining" name="Remaining to Goal" fill="hsl(43 74% 49% / 0.3)" radius={[0, 4, 4, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Company Revenue by Month */}
            <Card className="border-blue-500/10">
              <CardHeader>
                <CardTitle className="text-blue-500 font-display flex items-center gap-2">
                  <Calendar className="h-5 w-5" /> Company Revenue by Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {monthlyRevenue.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyRevenue}>
                        <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="earned" name="Earned" stackId="1" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45% / 0.5)" />
                        <Area type="monotone" dataKey="pending" name="Pending" stackId="1" stroke="hsl(43 74% 49%)" fill="hsl(43 74% 49% / 0.5)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No revenue data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline by Month */}
            <Card className="border-purple-500/10">
              <CardHeader>
                <CardTitle className="text-purple-500 font-display flex items-center gap-2">
                  <Users className="h-5 w-5" /> Pipeline by Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {monthlyPipeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyPipeline}>
                        <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                          formatter={(value: number, name: string) => [
                            name === 'projectedGci' ? `$${value.toLocaleString()}` : value,
                            name === 'projectedGci' ? 'Projected GCI' : name
                          ]}
                        />
                        <Legend />
                        <Bar dataKey="buyers" name="Buyers" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="sellers" name="Sellers" fill="hsl(280 67% 60%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No pipeline data available
                    </div>
                  )}
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
                className={`border-gold/10 cursor-pointer transition-all hover:border-gold/30 hover:shadow-lg ${selectedAgent === agent.id ? 'border-gold ring-1 ring-gold' : ''}`}
                onClick={() => navigate(`/dashboard/admin/agent/${agent.id}`)}
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
