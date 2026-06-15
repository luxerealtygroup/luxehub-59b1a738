import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { followUpBossApi, FUBDeal, FUBDealUser } from '@/lib/api/followUpBoss';
import { useDealMetadata } from '@/hooks/useDealMetadata';
import { sumWeightedDeals, getDealWeight, formatWeightedDeals } from '@/lib/utils/dealWeight';
import { DealTypeDropdown } from '@/components/DealTypeDropdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, DollarSign, Users, TrendingUp, Target, Loader2, BarChart3, Calendar, FileText, ArrowRightLeft, Filter, CheckSquare, Download, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, Legend } from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';
import TeamGoals from './TeamGoals';
import PipelineReport from './PipelineReport';
import CompanyBudget from './CompanyBudget';
import AnnualBudgetChart from './AnnualBudgetChart';
import AccountsPayable from './AccountsPayable';
import Team411 from './Team411';
import ConversionReport from './ConversionReport';

import { CreateAgentDialog } from './CreateAgentDialog';
import { SyncClaudeProfilesButton } from './SyncClaudeProfilesButton';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const TAB_LABELS: Record<string, string> = {
  pipeline: 'Pipeline & Sales',
  budget: 'Budget & Finances',
  team: 'Team Performance',
  analytics: 'Analytics',
  team411: 'Team 4-1-1',
  conversions: 'Conversions',
};

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
  conditionalGci: number;
  companyRevenueEarned: number;
  companyRevenuePending: number;
  companyRevenueConditional: number;
  closedDeals: number;
  pendingDeals: number;
  conditionalDeals: number;
}

interface FUBAgentStats {
  id: number;
  name: string;
  picture?: string;
  totalGci: number;
  pendingGci: number;
  conditionalGci: number;
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

interface QuarterlyGoals {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

interface CompanyTransaction {
  id: number;
  clientName: string;
  propertyAddress: string;
  closingDate: string | null;
  gci: number;
  companyRevenue: number;
  status: 'closed' | 'pending' | 'conditional';
  stageName: string;
  agentName: string;
}

const COLORS = ['hsl(43, 74%, 49%)', 'hsl(142, 71%, 45%)', 'hsl(217, 91%, 60%)', 'hsl(280, 67%, 60%)', 'hsl(350, 89%, 60%)'];

// FUB user IDs of admin-only users (not agents) - exclude from leaderboards
const ADMIN_ONLY_FUB_IDS = [8]; // Marie Zinger

const getValidDate = (value?: string | null): Date | null => {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const getMonthKey = (value?: string | null): string | null => {
  const date = getValidDate(value);
  return date ? format(startOfMonth(date), 'yyyy-MM') : null;
};

const formatMonthLabel = (month: string) => {
  const date = getValidDate(`${month}-01`);
  return date ? format(date, 'MMM yyyy') : month;
};

const formatDashboardDate = (value?: string | null) => {
  const date = getValidDate(value);
  return date ? format(date, 'MMM d, yyyy') : '-';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { user } = useAuth();
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [fubStats, setFubStats] = useState<FUBStats | null>(null);
  const [fubAgents, setFubAgents] = useState<FUBAgentStats[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenueData[]>([]);
  const [monthlyPipeline, setMonthlyPipeline] = useState<MonthlyPipelineData[]>([]);
  const [companyTransactions, setCompanyTransactions] = useState<CompanyTransaction[]>([]);
  const [quarterlyGoals, setQuarterlyGoals] = useState<QuarterlyGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showPipelineReport, setShowPipelineReport] = useState(false);
  const [txFilter, setTxFilter] = useState<'all' | 'needs_review'>('all');
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<string>('pipeline');
  const pipelineRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<HTMLDivElement>(null);
  const analyticsRef = useRef<HTMLDivElement>(null);
  const team411Ref = useRef<HTMLDivElement>(null);
  const conversionsRef = useRef<HTMLDivElement>(null);

  const { metadata: dealMetadata, upsertDealCategory, bulkUpsert, refetch: refetchMetadata } = useDealMetadata();

  useEffect(() => {
    if (roleLoading || !isAdmin) return;

    const fetchCompanyData = async () => {
      setLoading(true);
      setLoadError(null);

      // Fetch FUB deals for company-wide stats
      const fubResponse = await followUpBossApi.getDeals(200, 0);
      let fubDealsAll: FUBDeal[] = [];
      if (fubResponse.success && fubResponse.data?.deals) {
        const deals = fubResponse.data.deals;
        fubDealsAll = deals;
        
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
        
        // Conditional deals = deals with stage "Offer" (conditional/offer stage)
        const conditionalDeals = deals.filter((d: FUBDeal) => 
          d.stageName?.toLowerCase() === 'offer'
        );
        
        // Active deals = everything else that's not closed/won/lost/pending/offer
        const activeDeals = deals.filter((d: FUBDeal) => 
          d.status?.toLowerCase() !== 'won' && 
          d.status?.toLowerCase() !== 'lost' &&
          !d.stageName?.toLowerCase().includes('closed') &&
          !d.stageName?.toLowerCase().includes('won') &&
          d.stageName?.toLowerCase() !== 'pending' &&
          d.stageName?.toLowerCase() !== 'offer'
        );

        // Total GCI = full commission value from closed deals (no splits)
        const totalGci = closedDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.commissionValue || 0), 0
        );

        // Pending GCI = full commission value from pending deals (no splits)
        const pendingGci = pendingDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.commissionValue || 0), 0
        );

        // Conditional GCI = full commission value from conditional/offer deals
        const conditionalGci = conditionalDeals.reduce((sum: number, d: FUBDeal) => 
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

        // Company Revenue Conditional = teamCommission from conditional/offer deals
        const companyRevenueConditional = conditionalDeals.reduce((sum: number, d: FUBDeal) => 
          sum + (d.teamCommission || 0), 0
        );

        setFubStats({
          totalGci,
          pendingGci,
          conditionalGci,
          companyRevenueEarned,
          companyRevenuePending,
          companyRevenueConditional,
          closedDeals: sumWeightedDeals(closedDeals, dealMetadata),
          pendingDeals: sumWeightedDeals(pendingDeals, dealMetadata),
          conditionalDeals: sumWeightedDeals(conditionalDeals, dealMetadata),
        });

        // Build company transactions list from all relevant deals
        const allTransactions: CompanyTransaction[] = [
          ...closedDeals.map((deal: FUBDeal) => ({
            id: deal.id,
            clientName: deal.people?.[0]?.name || deal.name || 'Unknown',
            propertyAddress: deal.name || '',
            closingDate: deal.projectedCloseDate || deal.createdAt || null,
            gci: deal.commissionValue || 0,
            companyRevenue: deal.teamCommission || 0,
            status: 'closed' as const,
            stageName: deal.stageName || 'Closed',
            agentName: deal.users?.[0]?.name || 'Unknown',
          })),
          ...pendingDeals.map((deal: FUBDeal) => ({
            id: deal.id,
            clientName: deal.people?.[0]?.name || deal.name || 'Unknown',
            propertyAddress: deal.name || '',
            closingDate: deal.projectedCloseDate || null,
            gci: deal.commissionValue || 0,
            companyRevenue: deal.teamCommission || 0,
            status: 'pending' as const,
            stageName: deal.stageName || 'Pending',
            agentName: deal.users?.[0]?.name || 'Unknown',
          })),
          ...conditionalDeals.map((deal: FUBDeal) => ({
            id: deal.id,
            clientName: deal.people?.[0]?.name || deal.name || 'Unknown',
            propertyAddress: deal.name || '',
            closingDate: deal.projectedCloseDate || null,
            gci: deal.commissionValue || 0,
            companyRevenue: deal.teamCommission || 0,
            status: 'conditional' as const,
            stageName: deal.stageName || 'Offer',
            agentName: deal.users?.[0]?.name || 'Unknown',
          })),
        ].sort((a, b) => {
          // Sort by closing date descending (most recent first)
          const aTime = getValidDate(a.closingDate)?.getTime() ?? 0;
          const bTime = getValidDate(b.closingDate)?.getTime() ?? 0;
          return bTime - aTime;
        });
        
        setCompanyTransactions(allTransactions);

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
              conditionalGci: 0,
              teamCommission: 0,
              dealCount: 0,
            };
            
            const isClosedDeal = deal.status?.toLowerCase() === 'won' || 
              deal.stageName?.toLowerCase().includes('closed') ||
              deal.stageName?.toLowerCase().includes('won');
            const isPendingDeal = deal.stageName?.toLowerCase() === 'pending';
            const isConditionalDeal = deal.stageName?.toLowerCase() === 'offer';
            
            if (isClosedDeal) {
              existing.totalGci += deal.commissionValue || 0;
              existing.teamCommission += deal.teamCommission || 0;
              existing.dealCount += getDealWeight(deal, dealMetadata);
            } else if (isPendingDeal) {
              existing.pendingGci += deal.commissionValue || 0;
              existing.teamCommission += deal.teamCommission || 0;
              existing.dealCount += getDealWeight(deal, dealMetadata);
            } else if (isConditionalDeal) {
              existing.conditionalGci += deal.commissionValue || 0;
              existing.teamCommission += deal.teamCommission || 0;
              existing.dealCount += getDealWeight(deal, dealMetadata);
            }
            
            agentMap.set(user.id, existing);
          });
        });
        
        // Fetch all profiles with fub_user_id to include agents without deals
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, fub_user_id')
          .not('fub_user_id', 'is', null);
        
        // Add any agents from profiles that aren't in the deal data (excluding admin-only users)
        (allProfiles || []).forEach(profile => {
          if (profile.fub_user_id && !agentMap.has(profile.fub_user_id) && !ADMIN_ONLY_FUB_IDS.includes(profile.fub_user_id)) {
            agentMap.set(profile.fub_user_id, {
              id: profile.fub_user_id,
              name: profile.full_name || 'Unknown Agent',
              picture: undefined,
              totalGci: 0,
              pendingGci: 0,
              conditionalGci: 0,
              teamCommission: 0,
              dealCount: 0,
            });
          }
        });
        
        const sortedAgents = Array.from(agentMap.values())
          .filter(agent => !ADMIN_ONLY_FUB_IDS.includes(agent.id)) // Exclude admin-only users
          .filter(agent => agent.name && agent.name !== 'Unknown Agent') // Exclude unknown agents
          .sort((a, b) => (b.totalGci + b.pendingGci + b.conditionalGci) - (a.totalGci + a.pendingGci + a.conditionalGci));
        setFubAgents(sortedAgents);

        // Build monthly revenue data from FUB deals
        const revenueByMonth = new Map<string, { earned: number; pending: number }>();
        deals.forEach((deal: FUBDeal) => {
          const closeDate = deal.projectedCloseDate || deal.createdAt;
          const monthKey = getMonthKey(closeDate);
          if (!monthKey) return;
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
            monthLabel: formatMonthLabel(month),
            earned: data.earned,
            pending: data.pending,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));
        setMonthlyRevenue(monthlyRevenueData);
      }

      // Fetch all profiles with fub_user_id (active agents)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, fub_user_id');

      // Fetch user roles to exclude admin-only users
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Create a set of admin-only user IDs (admins who are not also owners/agents)
      const adminOnlyUserIds = new Set(
        (userRoles || [])
          .filter(ur => ur.role === 'admin')
          .map(ur => ur.user_id)
      );

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

      // Fetch company goals for quarterly seasonality
      const { data: companyGoalsData } = await supabase
        .from('company_goals')
        .select('*')
        .eq('year', 2026)
        .maybeSingle();

      // Parse quarterly goals from company_goals if available
      if (companyGoalsData?.monthly_goals) {
        const rawData = companyGoalsData.monthly_goals as any;
        // Check if it's the new format with quarterly data
        if (rawData && typeof rawData === 'object' && 'quarterly' in rawData) {
          const quarterly = rawData.quarterly;
          if (Array.isArray(quarterly) && quarterly.length === 4) {
            setQuarterlyGoals({
              q1: quarterly[0].deals || 0,
              q2: quarterly[1].deals || 0,
              q3: quarterly[2].deals || 0,
              q4: quarterly[3].deals || 0,
            });
          }
        } else if (companyGoalsData.annual_deals_goal) {
          // Old format - even distribution
          const evenQuarterly = Math.ceil(companyGoalsData.annual_deals_goal / 4);
          setQuarterlyGoals({
            q1: evenQuarterly,
            q2: evenQuarterly,
            q3: evenQuarterly,
            q4: evenQuarterly,
          });
        }
      }

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unknown Agent']));
      const fubIdMap = new Map<string, number | null>((profiles || []).map(p => [p.id, p.fub_user_id ?? null]));
      const goalsMap = new Map((productionGoals || []).map(g => [g.user_id, g]));
      
      // Include all agents (with or without fub_user_id), excluding admin-only users
      const agentIds = new Set([
        ...(profiles || [])
          .filter(p => !adminOnlyUserIds.has(p.id))
          .map(p => p.id),
        ...(deals || []).map(d => d.user_id),
        ...(commissions || []).map(c => c.user_id),
        ...(pipelineClients || []).map(p => p.user_id),
      ]);

      const agentData: AgentData[] = Array.from(agentIds).map(agentId => {
        const agentDeals = (deals || []).filter(d => d.user_id === agentId);
        const agentCommissions = (commissions || []).filter(c => c.user_id === agentId);
        const agentPipeline = (pipelineClients || []).filter(p => p.user_id === agentId);
        const weightPipeline = (arr: any[]) =>
          Math.round(
            arr.reduce((s, c) => s + (c.client_type === 'tenant' || c.client_type === 'landlord' ? 1 / 3 : 1), 0) * 100,
          ) / 100;
        const agentGoals = goalsMap.get(agentId);

        // Source of truth: FUB. If the agent is linked to a FUB user, count
        // their closed/active deals and GCI from the FUB feed instead of local DB.
        const fubUserId = fubIdMap.get(agentId) ?? null;
        let closedDeals = agentDeals.filter(d => d.stage === 'closed').length;
        let activeDeals = agentDeals.filter(d => ['lead', 'contacted', 'showing', 'offer', 'under_contract'].includes(d.stage)).length;

        if (fubUserId && fubDealsAll.length > 0) {
          const agentFubDeals = fubDealsAll.filter(d => d.users?.some(u => u.id === fubUserId));
          closedDeals = sumWeightedDeals(agentFubDeals.filter(d =>
            d.status?.toLowerCase() === 'won' ||
            d.stageName?.toLowerCase().includes('closed') ||
            d.stageName?.toLowerCase().includes('won')
          ), dealMetadata);
          activeDeals = sumWeightedDeals(agentFubDeals.filter(d =>
            d.status?.toLowerCase() !== 'won' &&
            d.status?.toLowerCase() !== 'lost' &&
            !d.stageName?.toLowerCase().includes('closed') &&
            !d.stageName?.toLowerCase().includes('won')
          ), dealMetadata);
        }

        let totalGci = agentCommissions
          .filter(c => c.status === 'paid')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        let pendingGci = agentCommissions
          .filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + Number(c.gross_commission || c.amount || 0), 0);

        const pipelineGci = agentPipeline
          .reduce((sum, p) => sum + Number(p.projected_gci || 0), 0);

        // Calculate company cut from deals
        let companyCut = agentDeals
          .filter(d => d.stage === 'closed')
          .reduce((sum, d) => {
            const dealValue = Number(d.deal_value || 0);
            const commissionRate = Number(d.commission_rate || 3) / 100;
            const companySplit = Number(d.company_split_percentage || 30) / 100;
            return sum + (dealValue * commissionRate * companySplit);
          }, 0);

        // FUB override for GCI / company cut when the agent is linked to FUB
        if (fubUserId && fubDealsAll.length > 0) {
          const agentFubDeals = fubDealsAll.filter(d => d.users?.some(u => u.id === fubUserId));
          const fubClosed = agentFubDeals.filter(d =>
            d.status?.toLowerCase() === 'won' ||
            d.stageName?.toLowerCase().includes('closed') ||
            d.stageName?.toLowerCase().includes('won')
          );
          const fubPending = agentFubDeals.filter(d => d.stageName?.toLowerCase() === 'pending');
          totalGci = fubClosed.reduce((s, d) => s + Number(d.agentCommission || 0), 0);
          pendingGci = fubPending.reduce((s, d) => s + Number(d.agentCommission || 0), 0);
          companyCut = fubClosed.reduce((s, d) => s + Number(d.teamCommission || 0), 0);
        }

        return {
          id: agentId,
          full_name: profilesMap.get(agentId) || 'Unknown Agent',
          closedDeals,
          activeDeals,
          totalGci,
          pendingGci,
          companyCut,
          pipelineClients: weightPipeline(agentPipeline),
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
        totalPipelineClients: Math.round(
          (pipelineClients || []).reduce(
            (s: number, c: any) => s + (c.client_type === 'tenant' || c.client_type === 'landlord' ? 1 / 3 : 1),
            0,
          ) * 100,
        ) / 100,
        totalPipelineGci,
        agents: agentData
          .filter(a => a.full_name && a.full_name !== 'Unknown Agent') // Exclude unknown agents
          .sort((a, b) => b.totalGci - a.totalGci),
      };

      setStats(companyStats);

      // Build monthly pipeline data
      const pipelineByMonth = new Map<string, { buyers: number; sellers: number; projectedGci: number }>();
      (pipelineClients || []).forEach((client: { expected_pending_date?: string; created_at: string; client_type: string; projected_gci?: number }) => {
        const targetDate = client.expected_pending_date || client.created_at;
        const monthKey = getMonthKey(targetDate);
        if (!monthKey) return;
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
          monthLabel: formatMonthLabel(month),
          buyers: data.buyers,
          sellers: data.sellers,
          total: data.buyers + data.sellers,
          projectedGci: data.projectedGci,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
      setMonthlyPipeline(monthlyPipelineData);

      setLoading(false);
    };

    const safeFetchCompanyData = () => {
      fetchCompanyData().catch((error) => {
        console.error('Company dashboard failed to load:', error);
        setLoadError('Company dashboard could not load. Please refresh and try again.');
        setLoading(false);
      });
    };

    safeFetchCompanyData();

    // Auto-refresh FUB data every 3 minutes
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing admin FUB data...');
      safeFetchCompanyData();
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

  if (loadError) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-destructive font-medium">{loadError}</p>
          <Button onClick={() => window.location.reload()} variant="outline">Refresh Dashboard</Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const tabRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    pipeline: pipelineRef,
    budget: budgetRef,
    team: teamRef,
    analytics: analyticsRef,
    team411: team411Ref,
    conversions: conversionsRef,
  };

  const handleExportPdf = async () => {
    const ref = tabRefs[activeTab];
    if (!ref?.current) {
      toast.error('Nothing to export on this tab');
      return;
    }
    const label = TAB_LABELS[activeTab] || 'Report';
    toast.loading('Generating PDF...', { id: 'pdf-export' });
    try {
      const node = ref.current;
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: '#0F172A',
        useCORS: true,
        logging: false,
        windowWidth: node.scrollWidth,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Header
      pdf.setFontSize(16);
      pdf.text(`Company Dashboard — ${label}`, 20, 30);
      pdf.setFontSize(10);
      pdf.text(format(new Date(), 'MMMM d, yyyy h:mm a'), 20, 46);

      let heightLeft = imgHeight;
      let position = 60;
      pdf.addImage(imgData, 'JPEG', 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - position;
      while (heightLeft > 0) {
        pdf.addPage();
        position = -(imgHeight - heightLeft) + 20;
        pdf.addImage(imgData, 'JPEG', 20, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`company-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exported', { id: 'pdf-export' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF', { id: 'pdf-export' });
    }
  };

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

  // Filter transactions for "Needs Review" (no deal_metadata row yet)
  const filteredTransactions = txFilter === 'needs_review'
    ? companyTransactions.filter(t => !dealMetadata.has(t.id))
    : companyTransactions;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Company Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all agent performance and company revenue</p>
        </div>
        <CreateAgentDialog />
        <div className="flex items-center gap-3">
          <SyncClaudeProfilesButton />
          <Button
            onClick={handleExportPdf}
            variant="outline"
            className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button 
            onClick={() => setShowPipelineReport(true)} 
            variant="outline"
            className="border-gold text-gold hover:bg-gold/10"
          >
            <FileText className="h-4 w-4 mr-2" />
            Pipeline Report
          </Button>
          <Badge variant="outline" className="border-gold text-gold">
            {stats.agents.length} Agents
          </Badge>
        </div>
      </div>

      {showPipelineReport && (
        <PipelineReport onClose={() => setShowPipelineReport(false)} />
      )}

      {/* Company-wide Stats from FUB */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Total GCI Earned</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {formatCurrency(fubStats?.totalGci)}
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
              {formatCurrency(fubStats?.pendingGci)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fubStats?.pendingDeals || 0} pending deals
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-500/20 bg-gradient-to-br from-card to-orange-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              <span className="text-sm text-muted-foreground">Conditional GCI</span>
            </div>
            <p className="text-3xl font-bold text-orange-500">
              {formatCurrency(fubStats?.conditionalGci)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fubStats?.conditionalDeals || 0} conditional deals
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
              {formatCurrency((fubStats?.companyRevenueEarned || 0) + (fubStats?.companyRevenuePending || 0) + (fubStats?.companyRevenueConditional || 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(fubStats?.companyRevenueEarned)} earned / {formatCurrency(fubStats?.companyRevenuePending)} pending / {formatCurrency(fubStats?.companyRevenueConditional)} conditional
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

      {/* Main Dashboard Sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
          <TabsTrigger value="pipeline" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Pipeline & Sales
          </TabsTrigger>
          <TabsTrigger value="budget" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Budget & Finances
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Team Performance
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="team411" className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Team 4-1-1
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Conversions
          </TabsTrigger>
        </TabsList>

        {/* PIPELINE & SALES TAB */}
        <TabsContent value="pipeline" className="space-y-6" ref={pipelineRef}>
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
                  <p className="text-3xl font-bold text-gold">{formatCurrency(teamPipelineSummary.totalProjectedGci)}</p>
                  <p className="text-sm text-muted-foreground">Projected Pipeline GCI</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-500/10">
                  <p className="text-3xl font-bold text-green-500">{teamPipelineSummary.totalDealsGoal}</p>
                  <p className="text-sm text-muted-foreground">Team Deals Goal</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-500/10">
                  <p className="text-3xl font-bold text-blue-500">{formatCurrency(teamPipelineSummary.totalGciGoal)}</p>
                  <p className="text-sm text-muted-foreground">Team GCI Goal</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline by Agent */}
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

          {/* Quarterly Pipeline Overview */}
          <Card className="border-purple-500/10">
            <CardHeader>
              <CardTitle className="text-purple-500 font-display flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Pipeline by Quarter
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const currentYear = new Date().getFullYear();
                
                // Use seasonal quarterly goals if available, otherwise fallback to even distribution
                const fallbackQuarterly = Math.ceil(teamPipelineSummary.totalDealsGoal / 4);
                const quarterGoals = quarterlyGoals || {
                  q1: fallbackQuarterly,
                  q2: fallbackQuarterly,
                  q3: fallbackQuarterly,
                  q4: fallbackQuarterly,
                };
                
                // Define quarters with their months and individual goals
                const quarters = [
                  { label: 'Q1', months: ['01', '02', '03'], monthNames: 'Jan - Mar', goal: quarterGoals.q1 },
                  { label: 'Q2', months: ['04', '05', '06'], monthNames: 'Apr - Jun', goal: quarterGoals.q2 },
                  { label: 'Q3', months: ['07', '08', '09'], monthNames: 'Jul - Sep', goal: quarterGoals.q3 },
                  { label: 'Q4', months: ['10', '11', '12'], monthNames: 'Oct - Dec', goal: quarterGoals.q4 },
                ];
                
                // Build quarterly data by aggregating monthly data
                const quarterlyData = quarters.map(quarter => {
                  const quarterMonths = quarter.months.map(m => `${currentYear}-${m}`);
                  const monthsData = quarterMonths.map(monthKey => 
                    monthlyPipeline.find(m => m.month === monthKey)
                  );
                  
                  return {
                    label: quarter.label,
                    monthNames: quarter.monthNames,
                    buyers: monthsData.reduce((sum, m) => sum + (m?.buyers || 0), 0),
                    sellers: monthsData.reduce((sum, m) => sum + (m?.sellers || 0), 0),
                    total: monthsData.reduce((sum, m) => sum + (m?.total || 0), 0),
                    projectedGci: monthsData.reduce((sum, m) => sum + (m?.projectedGci || 0), 0),
                    goal: quarter.goal,
                  };
                });

                return (
                  <div className="space-y-4">
                    {quarterlyData.map((quarter) => {
                      const percentage = quarter.goal > 0 ? Math.min((quarter.total / quarter.goal) * 100, 100) : 0;
                      const isOnTrack = quarter.total >= quarter.goal;
                      const needed = Math.max(0, quarter.goal - quarter.total);

                      return (
                        <div key={quarter.label} className="space-y-2 p-4 rounded-lg border border-border/50 bg-muted/20">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-foreground text-lg">{quarter.label}</span>
                              <span className="text-sm text-muted-foreground">{quarter.monthNames}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className={`font-semibold ${isOnTrack ? 'text-green-500' : 'text-gold'}`}>
                                {quarter.total} / {quarter.goal} clients
                              </span>
                              {needed > 0 && (
                                <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-500">
                                  Need {needed} more
                                </Badge>
                              )}
                              {isOnTrack && quarter.total > 0 && (
                                <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
                                  On track
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-blue-500">{quarter.buyers} buyers</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-purple-500">{quarter.sellers} sellers</span>
                            <span className="text-muted-foreground ml-auto">
                              Projected GCI: <span className="text-green-500 font-medium">{formatCurrency(quarter.projectedGci)}</span>
                            </span>
                          </div>
                          <Progress 
                            value={percentage} 
                            className="h-3" 
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Company Transactions List */}
          <Card className="border-gold/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-gold font-display flex items-center gap-2">
                  <FileText className="h-5 w-5" /> All Company Transactions
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedTxIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1"
                      onClick={async () => {
                        if (!user) return;
                        try {
                          await bulkUpsert(Array.from(selectedTxIds), 'lease', user.id);
                          toast.success(`Marked ${selectedTxIds.size} deals as Lease`);
                          setSelectedTxIds(new Set());
                          refetchMetadata();
                        } catch { toast.error('Failed to update'); }
                      }}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      Mark {selectedTxIds.size} as Lease
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={txFilter === 'needs_review' ? 'default' : 'outline'}
                    className="text-xs gap-1"
                    onClick={() => setTxFilter(f => f === 'needs_review' ? 'all' : 'needs_review')}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {txFilter === 'needs_review' ? 'Showing: Needs Review' : 'Filter: Needs Review'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {companyTransactions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No transactions found</p>
              ) : (
                <>
                  {/* Summary Cards */}
                  {(() => {
                    const closed = filteredTransactions.filter(t => t.status === 'closed');
                    const pending = filteredTransactions.filter(t => t.status === 'pending');
                    const conditional = filteredTransactions.filter(t => t.status === 'conditional');
                    const totalGci = filteredTransactions.reduce((s, t) => s + t.gci, 0);
                    const totalRevenue = filteredTransactions.reduce((s, t) => s + t.companyRevenue, 0);

                    return (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{closed.length}</p>
                          <p className="text-xs text-muted-foreground">Closed</p>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
                          <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-orange-400">{conditional.length}</p>
                          <p className="text-xs text-muted-foreground">Conditional</p>
                        </div>
                        <div className="bg-gold/10 border border-gold/20 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-gold">{formatCurrency(totalGci)}</p>
                          <p className="text-xs text-muted-foreground">Gross GCI</p>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center col-span-2 md:col-span-1">
                          <p className="text-lg font-bold text-blue-400">{formatCurrency(totalRevenue)}</p>
                          <p className="text-xs text-muted-foreground">Company Revenue</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Grouped Transaction Tables */}
                  {([
                    { key: 'closed', label: 'Closed Deals', color: 'green', icon: '✅' },
                    { key: 'pending', label: 'Pending Deals', color: 'amber', icon: '⏳' },
                    { key: 'conditional', label: 'Conditional (Offer)', color: 'orange', icon: '📝' },
                  ] as const).map(({ key, label, color, icon }) => {
                    const group = filteredTransactions.filter(t => t.status === key);
                    if (group.length === 0) return null;
                    const groupGci = group.reduce((s, t) => s + t.gci, 0);
                    const groupRevenue = group.reduce((s, t) => s + t.companyRevenue, 0);

                    return (
                      <div key={key} className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className={`text-sm font-semibold flex items-center gap-2 text-${color}-400`}>
                            <span>{icon}</span> {label} ({group.length})
                          </h3>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-gold font-medium">GCI: {formatCurrency(groupGci)}</span>
                            <span className="text-blue-400 font-medium">Revenue: {formatCurrency(groupRevenue)}</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto border border-border/50 rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8">
                                  <Checkbox
                                    checked={group.every(t => selectedTxIds.has(t.id))}
                                    onCheckedChange={(checked) => {
                                      setSelectedTxIds(prev => {
                                        const next = new Set(prev);
                                        group.forEach(t => checked ? next.add(t.id) : next.delete(t.id));
                                        return next;
                                      });
                                    }}
                                  />
                                </TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Property</TableHead>
                                <TableHead>Agent</TableHead>
                                <TableHead>{key === 'closed' ? 'Close Date' : 'Projected Close'}</TableHead>
                                <TableHead>Deal Type</TableHead>
                                <TableHead className="text-right">GCI</TableHead>
                                <TableHead className="text-right">Company Revenue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.map((transaction) => {
                                const meta = dealMetadata.get(transaction.id);
                                return (
                                  <TableRow key={transaction.id} className="border-border/50">
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedTxIds.has(transaction.id)}
                                        onCheckedChange={(checked) => {
                                          setSelectedTxIds(prev => {
                                            const next = new Set(prev);
                                            if (checked) next.add(transaction.id);
                                            else next.delete(transaction.id);
                                            return next;
                                          });
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">{transaction.clientName}</TableCell>
                                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                      {transaction.propertyAddress || '-'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{transaction.agentName}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {formatDashboardDate(transaction.closingDate)}
                                    </TableCell>
                                    <TableCell>
                                      <DealTypeDropdown
                                        fubDealId={transaction.id}
                                        currentCategory={meta?.deal_category || null}
                                        onchange={async (fubId, cat) => {
                                          if (!user) return;
                                          try {
                                            await upsertDealCategory(fubId, cat, user.id);
                                            toast.success(`Deal marked as ${cat}`);
                                          } catch { toast.error('Failed to update'); }
                                        }}
                                        compact
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-semibold text-gold">
                                      {formatCurrency(transaction.gci)}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold text-blue-500">
                                      {formatCurrency(transaction.companyRevenue)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BUDGET & FINANCES TAB */}
        <TabsContent value="budget" className="space-y-6" ref={budgetRef}>
          {/* Monthly Budget */}
          <CompanyBudget />
          
          {/* Annual Budget vs Revenue Chart */}
          <AnnualBudgetChart />
          
          {/* Accounts Payable from Asana */}
          <AccountsPayable />

          {/* Team Goals */}
          <TeamGoals />
        </TabsContent>

        {/* TEAM PERFORMANCE TAB */}
        <TabsContent value="team" className="space-y-6" ref={teamRef}>
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
                          {formatCurrency(agent.totalGci + agent.pendingGci + agent.conditionalGci)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(agent.totalGci)} earned / {formatCurrency(agent.pendingGci)} pending / {formatCurrency(agent.conditionalGci)} conditional
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agent Cards Grid */}
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

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-6" ref={analyticsRef}>
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
        </TabsContent>
        {/* TEAM 4-1-1 TAB */}
        <TabsContent value="team411" className="space-y-6" ref={team411Ref}>
          <Team411 />
        </TabsContent>
        {/* CONVERSION REPORT TAB */}
        <TabsContent value="conversions" className="space-y-6" ref={conversionsRef}>
          <ConversionReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
