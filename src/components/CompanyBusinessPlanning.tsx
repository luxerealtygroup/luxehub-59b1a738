import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { classifyStage, isActiveListingDeal } from '@/hooks/useFubDealMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Target, TrendingUp, DollarSign, Users, Building2,
  UserPlus, ClipboardList, Loader2, Save, BarChart3,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────
interface CompanyMetrics {
  closedDeals: number;
  pendingDeals: number;
  activeListings: number;
  totalPipeline: number;
  grossGciClosed: number;
  grossGciPending: number;
}

interface AgentGoalRow {
  agentName: string;
  userId: string;
  dealGoal: number;
  gciGoal: number;
  volumeGoal: number;
}

interface RecruitingData {
  id?: string;
  year: number;
  quarter: number;
  recruiting_leads: number;
  interviews: number;
  offers: number;
  accepted: number;
  avg_agent_production: number;
  notes: string;
}

const CURRENT_YEAR = 2026;
const CURRENT_QUARTER = Math.ceil((new Date().getMonth() + 1) / 3);

// ── Component ────────────────────────────────────────────────────────────
const CompanyBusinessPlanning = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [agentGoals, setAgentGoals] = useState<AgentGoalRow[]>([]);
  const [companyDealGoal, setCompanyDealGoal] = useState(0);
  const [companyGciGoal, setCompanyGciGoal] = useState(0);
  const [recruiting, setRecruiting] = useState<RecruitingData>({
    year: CURRENT_YEAR,
    quarter: CURRENT_QUARTER,
    recruiting_leads: 0,
    interviews: 0,
    offers: 0,
    accepted: 0,
    avg_agent_production: 8,
    notes: '',
  });
  const [savingRecruiting, setSavingRecruiting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFubMetrics(), fetchAgentGoals(), fetchCompanyGoals(), fetchRecruiting()]);
    setLoading(false);
  };

  // ── 1. FUB metrics aggregation ──
  const fetchFubMetrics = async () => {
    try {
      const collected: FUBDeal[] = [];
      const pageSize = 100;
      for (let page = 0; page < 10; page++) {
        const res = await followUpBossApi.getDeals(pageSize, page * pageSize);
        if (!res.success || !res.data?.deals) break;
        collected.push(...res.data.deals);
        if (res.data.deals.length < pageSize) break;
      }

      const closedDeals = collected.filter(d => classifyStage(d.stageName || '') === 'closed');
      const pendingDeals = collected.filter(d => classifyStage(d.stageName || '') === 'pending');
      const activeListings = collected.filter(d => isActiveListingDeal(d));
      const pipelineDeals = collected.filter(d => {
        const cls = classifyStage(d.stageName || '');
        return cls !== 'closed';
      });

      setMetrics({
        closedDeals: closedDeals.length,
        pendingDeals: pendingDeals.length,
        activeListings: activeListings.length,
        totalPipeline: pipelineDeals.length,
        grossGciClosed: closedDeals.reduce((s, d) => s + (d.commissionValue || d.agentCommission || 0), 0),
        grossGciPending: pendingDeals.reduce((s, d) => s + (d.commissionValue || d.agentCommission || 0), 0),
      });
    } catch (err) {
      console.error('CompanyBP: FUB fetch error', err);
    }
  };

  // ── 2. Agent goals ──
  const fetchAgentGoals = async () => {
    const [goalsRes, profilesRes] = await Promise.all([
      supabase.from('production_goals').select('user_id, annual_units_goal, annual_gci_goal, annual_volume_goal').eq('year', CURRENT_YEAR),
      supabase.from('profiles').select('id, full_name'),
    ]);
    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name || 'Unknown']));
    setAgentGoals(
      (goalsRes.data || []).map(g => ({
        agentName: profileMap.get(g.user_id) || 'Unknown',
        userId: g.user_id,
        dealGoal: g.annual_units_goal || 0,
        gciGoal: g.annual_gci_goal || 0,
        volumeGoal: g.annual_volume_goal || 0,
      })),
    );
  };

  // ── 3. Company goals ──
  const fetchCompanyGoals = async () => {
    const { data } = await supabase.from('company_goals').select('annual_deals_goal, annual_gci_goal').eq('year', CURRENT_YEAR).maybeSingle();
    if (data) {
      setCompanyDealGoal(data.annual_deals_goal || 0);
      setCompanyGciGoal(data.annual_gci_goal || 0);
    }
  };

  // ── 4. Recruiting pipeline ──
  const fetchRecruiting = async () => {
    const { data } = await supabase
      .from('recruiting_pipeline')
      .select('*')
      .eq('year', CURRENT_YEAR)
      .eq('quarter', CURRENT_QUARTER)
      .maybeSingle();
    if (data) {
      setRecruiting({
        id: data.id,
        year: data.year,
        quarter: data.quarter,
        recruiting_leads: data.recruiting_leads,
        interviews: data.interviews,
        offers: data.offers,
        accepted: data.accepted,
        avg_agent_production: data.avg_agent_production,
        notes: data.notes || '',
      });
    }
  };

  const saveRecruiting = async () => {
    if (!user) return;
    setSavingRecruiting(true);
    const payload = {
      year: recruiting.year,
      quarter: recruiting.quarter,
      recruiting_leads: recruiting.recruiting_leads,
      interviews: recruiting.interviews,
      offers: recruiting.offers,
      accepted: recruiting.accepted,
      avg_agent_production: recruiting.avg_agent_production,
      notes: recruiting.notes,
      created_by: user.id,
    };
    if (recruiting.id) {
      const { error } = await supabase.from('recruiting_pipeline').update(payload).eq('id', recruiting.id);
      if (error) toast.error('Failed to save'); else toast.success('Saved');
    } else {
      const { data, error } = await supabase.from('recruiting_pipeline').insert(payload).select().single();
      if (error) toast.error('Failed to save');
      else {
        toast.success('Saved');
        if (data) setRecruiting(prev => ({ ...prev, id: data.id }));
      }
    }
    setSavingRecruiting(false);
  };

  // ── Derived calculations ──
  const totalAgentDealGoal = useMemo(() => agentGoals.reduce((s, a) => s + a.dealGoal, 0), [agentGoals]);
  const totalAgentGciGoal = useMemo(() => agentGoals.reduce((s, a) => s + a.gciGoal, 0), [agentGoals]);
  const dealGap = companyDealGoal - totalAgentDealGoal;
  const gciGap = companyGciGoal - totalAgentGciGoal;
  const goalCoverage = companyDealGoal > 0 ? (totalAgentDealGoal / companyDealGoal) * 100 : 0;

  const avgProd = recruiting.avg_agent_production || 8;
  const agentsNeeded = dealGap > 0 ? Math.ceil(dealGap / avgProd) : 0;
  const monthsRemaining = Math.max(1, 12 - new Date().getMonth());
  const recruitsPerMonth = agentsNeeded > 0 ? (agentsNeeded / monthsRemaining).toFixed(1) : '0';
  const recruitsPerQuarter = agentsNeeded > 0 ? (agentsNeeded / Math.ceil(monthsRemaining / 3)).toFixed(1) : '0';

  // Projections
  const monthsElapsed = new Date().getMonth() + 1;
  const projectedClosings = monthsElapsed > 0 ? Math.round(((metrics?.closedDeals || 0) / monthsElapsed) * 12) : 0;
  const projectedGci = monthsElapsed > 0 ? Math.round(((metrics?.grossGciClosed || 0) / monthsElapsed) * 12) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <Card className="border-gold/20">
      <CardHeader>
        <CardTitle className="text-gold font-display flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Company Business Planning — {CURRENT_YEAR}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
            <TabsTrigger value="performance" className="flex items-center gap-1 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" /> Performance
            </TabsTrigger>
            <TabsTrigger value="coverage" className="flex items-center gap-1 text-xs sm:text-sm">
              <Target className="h-3.5 w-3.5" /> Goal Coverage
            </TabsTrigger>
            <TabsTrigger value="recruiting" className="flex items-center gap-1 text-xs sm:text-sm">
              <UserPlus className="h-3.5 w-3.5" /> Recruiting Need
            </TabsTrigger>
            <TabsTrigger value="execution" className="flex items-center gap-1 text-xs sm:text-sm">
              <ClipboardList className="h-3.5 w-3.5" /> Execution Plan
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Company Performance Reality ── */}
          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="YTD Closed Deals" value={metrics?.closedDeals || 0} icon={<Target className="h-4 w-4 text-green-500" />} />
              <MetricCard label="YTD Gross GCI" value={formatCurrency(metrics?.grossGciClosed)} icon={<DollarSign className="h-4 w-4 text-green-500" />} />
              <MetricCard label="Pending GCI" value={formatCurrency(metrics?.grossGciPending)} icon={<TrendingUp className="h-4 w-4 text-gold" />} />
              <MetricCard label="Active Listings" value={metrics?.activeListings || 0} icon={<Building2 className="h-4 w-4 text-blue-500" />} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard label="Total Pipeline Deals" value={metrics?.totalPipeline || 0} icon={<Users className="h-4 w-4 text-purple-500" />} />
              <MetricCard label="Projected Year-End Closings" value={projectedClosings} icon={<TrendingUp className="h-4 w-4 text-amber-500" />} sub={`Based on ${monthsElapsed} months pace`} />
              <MetricCard label="Projected Year-End GCI" value={formatCurrency(projectedGci)} icon={<DollarSign className="h-4 w-4 text-amber-500" />} sub={`Based on ${monthsElapsed} months pace`} />
            </div>
          </TabsContent>

          {/* ── TAB 2: Agent Goal Coverage ── */}
          <TabsContent value="coverage" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground">Company Goal (Deals)</p>
                <p className="text-2xl font-bold text-foreground">{companyDealGoal}</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground">Total Agent Goals</p>
                <p className="text-2xl font-bold text-foreground">{totalAgentDealGoal}</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground">Goal Coverage</p>
                <p className={`text-2xl font-bold ${goalCoverage >= 100 ? 'text-green-500' : 'text-destructive'}`}>
                  {Math.round(goalCoverage)}%
                </p>
                <Progress value={Math.min(goalCoverage, 100)} className="h-2 mt-2" />
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground">Deal Gap</p>
                <p className={`text-2xl font-bold ${dealGap > 0 ? 'text-destructive' : 'text-green-500'}`}>
                  {dealGap > 0 ? dealGap : 0}
                </p>
              </div>
            </div>

            {/* GCI gap summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">Company GCI Goal</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(companyGciGoal)}</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">GCI Gap</p>
                <p className={`text-xl font-bold ${gciGap > 0 ? 'text-destructive' : 'text-green-500'}`}>
                  {gciGap > 0 ? formatCurrency(gciGap) : formatCurrency(0)}
                </p>
              </div>
            </div>

            {/* Agent breakdown */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Deal Goal</TableHead>
                    <TableHead className="text-right">GCI Goal</TableHead>
                    <TableHead className="text-right">Volume Goal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentGoals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No agent goals found for {CURRENT_YEAR}. Agents need to set goals in Business Planning.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agentGoals.map(ag => (
                      <TableRow key={ag.userId}>
                        <TableCell className="font-medium">{ag.agentName}</TableCell>
                        <TableCell className="text-right">{ag.dealGoal}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ag.gciGoal)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ag.volumeGoal)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {agentGoals.length > 0 && (
                    <TableRow className="border-t-2 border-border font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totalAgentDealGoal}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalAgentGciGoal)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(agentGoals.reduce((s, a) => s + a.volumeGoal, 0))}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── TAB 3: Recruiting Requirement ── */}
          <TabsContent value="recruiting" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Deal Gap" value={Math.max(0, dealGap)} icon={<Target className="h-4 w-4 text-destructive" />} />
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Avg Production / Agent</p>
                <Input
                  type="number"
                  value={recruiting.avg_agent_production}
                  onChange={e => setRecruiting(prev => ({ ...prev, avg_agent_production: parseInt(e.target.value) || 1 }))}
                  className="h-8 w-20 text-lg font-bold"
                />
                <p className="text-xs text-muted-foreground mt-1">deals/year</p>
              </div>
              <MetricCard label="Agents Needed" value={agentsNeeded} icon={<UserPlus className="h-4 w-4 text-gold" />} />
              <MetricCard label="Months Remaining" value={monthsRemaining} icon={<TrendingUp className="h-4 w-4 text-blue-500" />} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg border border-gold/20 bg-gold/5 text-center">
                <p className="text-xs text-muted-foreground">Recruits per Month</p>
                <p className="text-3xl font-bold text-gold">{recruitsPerMonth}</p>
              </div>
              <div className="p-4 rounded-lg border border-gold/20 bg-gold/5 text-center">
                <p className="text-xs text-muted-foreground">Recruits per Quarter</p>
                <p className="text-3xl font-bold text-gold">{recruitsPerQuarter}</p>
              </div>
            </div>

            {dealGap <= 0 && (
              <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/5 text-center">
                <p className="text-green-500 font-medium">✓ Agent goals fully cover the company deal target — no recruiting needed for goal coverage.</p>
              </div>
            )}
          </TabsContent>

          {/* ── TAB 4: Company Execution Plan ── */}
          <TabsContent value="execution" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard label="Agents Needed" value={agentsNeeded} icon={<UserPlus className="h-4 w-4 text-gold" />} />
              <MetricCard label="Recruits / Quarter" value={recruitsPerQuarter} icon={<Target className="h-4 w-4 text-gold" />} />
              <MetricCard label="Recruits / Month" value={recruitsPerMonth} icon={<TrendingUp className="h-4 w-4 text-gold" />} />
            </div>

            {/* Recruiting Pipeline Tracker */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-gold" />
                  Recruiting Pipeline — Q{recruiting.quarter} {recruiting.year}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Recruiting Leads</Label>
                    <Input
                      type="number"
                      value={recruiting.recruiting_leads}
                      onChange={e => setRecruiting(prev => ({ ...prev, recruiting_leads: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Interviews</Label>
                    <Input
                      type="number"
                      value={recruiting.interviews}
                      onChange={e => setRecruiting(prev => ({ ...prev, interviews: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Offers</Label>
                    <Input
                      type="number"
                      value={recruiting.offers}
                      onChange={e => setRecruiting(prev => ({ ...prev, offers: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Accepted</Label>
                    <Input
                      type="number"
                      value={recruiting.accepted}
                      onChange={e => setRecruiting(prev => ({ ...prev, accepted: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                {/* Funnel visualization */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Recruiting Funnel</p>
                  {[
                    { label: 'Leads', val: recruiting.recruiting_leads, color: 'bg-blue-500' },
                    { label: 'Interviews', val: recruiting.interviews, color: 'bg-amber-500' },
                    { label: 'Offers', val: recruiting.offers, color: 'bg-gold' },
                    { label: 'Accepted', val: recruiting.accepted, color: 'bg-green-500' },
                  ].map(step => {
                    const max = Math.max(recruiting.recruiting_leads, 1);
                    const pct = (step.val / max) * 100;
                    return (
                      <div key={step.label} className="flex items-center gap-3">
                        <span className="text-xs w-20 text-right text-muted-foreground">{step.label}</span>
                        <div className="flex-1 h-6 rounded bg-muted/30 overflow-hidden">
                          <div className={`h-full ${step.color} rounded transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-medium w-8">{step.val}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={recruiting.notes}
                    onChange={e => setRecruiting(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Recruiting notes..."
                  />
                </div>

                <Button onClick={saveRecruiting} disabled={savingRecruiting} className="bg-gold hover:bg-gold/90 text-primary-foreground">
                  {savingRecruiting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Pipeline
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// ── Small reusable metric card ──
const MetricCard = ({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) => (
  <div className="p-4 rounded-lg border border-border bg-muted/20">
    <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-muted-foreground">{label}</p></div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>
);

export default CompanyBusinessPlanning;
