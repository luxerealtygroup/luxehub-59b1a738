import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';
import CompanyGoalDialog from '@/components/CompanyGoalDialog';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { classifyStage, isActiveListingDeal } from '@/hooks/useFubDealMetrics';
import { sumWeightedDeals, buildWeightedDebug, formatWeightedDeals, WeightedDebugInfo, inferDealCategory, DealMetadataMap } from '@/lib/utils/dealWeight';
import { useDealMetadata } from '@/hooks/useDealMetadata';
import { normalize411Row } from '@/lib/utils/weekly411Fallback';
import { computeFunnelRate, totalMetric, FunnelRate, Weekly411Raw } from '@/lib/funnelRates';
import { format, startOfYear, startOfWeek, addWeeks, isBefore, parseISO, getWeek } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Target, TrendingUp, DollarSign, Users, Building2,
  UserPlus, ClipboardList, Loader2, Save, BarChart3, ArrowRightLeft, Briefcase, PieChart, Crosshair, Info,
} from 'lucide-react';
import DealSourcesTab from '@/components/deal-sources/DealSourcesTab';
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
  // Weighted deal units
  weightedClosed: number;
  weightedPending: number;
  weightedPipeline: number;
  leasesClosed: number;
  leasesPending: number;
  leasesInPipeline: number;
  weightedDebug: WeightedDebugInfo | null;
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

interface PipelineSummary {
  totalClients: number;
  buyers: number;
  sellers: number;
  projectedGci: number;
  weightedTotal: number;
  leaseCount: number;
  /** Everyone entered into the pipeline this year and still live (stages 1–9), Leads included. */
  qualifiedClients: number;
  qualifiedWeighted: number;
  qualifiedBuyers: number;
  qualifiedSellers: number;
  qualifiedLeases: number;
  qualifiedGci: number;
  leadCount: number;
  finishedCount: number;
  /** Entered this year, including those since finished — the cohort denominator. */
  enteredThisYear: number;
  /** Records entered in an earlier year, excluded from this year's pipeline. */
  priorYearCount: number;
}

/**
 * Pipeline = everyone entered into the pipeline this year and still live,
 * Leads included. The conversion rate is measured over that same population,
 * so the fallout of leads that never convert is already priced into the rate;
 * excluding Leads here and then applying the rate would double-count fallout.
 * Stage 10+ is finished (closed or dead) and is no longer pipeline.
 *  1 Lead · 2 Active on MLS · 3 Exclusive Listing · 4 BRA Signed
 *  5 Appointment Held · 6 Appointment Set · 7 Showing · 8 Offer · 9 Pending
 */
const ACTIVE_PIPELINE_STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const LEAD_STAGE = 1;

/**
 * Used when a team has not set its own conversion rate. Measured over the
 * everyone-entered population, so it is the blended rate: 20% convert, 80% fall out.
 */
const DEFAULT_CONVERSION_RATE = 0.20;
/** Which population the conversion rate describes — shown beside the rate. */
const CONVERSION_POPULATION = 'everyone entered into the pipeline';

/** Optional per-team overrides for the funnel steps. Percentages, 0–100. */
export interface FunnelAssumptions {
  contact_to_pipeline_pct?: number | null;
  dials_to_contact_pct?: number | null;
  contact_to_appt_set_pct?: number | null;
}

interface ConversionTotals {
  contacts_made: number;
  dials: number;
  appointments_set: number;
  appointments_held: number;
  pipeline_additions: number;
  contracts_signed: number;
  firm_deals: number;
}

const pctFmt = (num: number, den: number): string => {
  if (den === 0) return '—';
  return ((num / den) * 100).toFixed(1) + '%';
};

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_QUARTER = Math.ceil((new Date().getMonth() + 1) / 3);
const QUARTER_END_DATE: Record<number, string> = {
  1: `${CURRENT_YEAR}-03-31`,
  2: `${CURRENT_YEAR}-06-30`,
  3: `${CURRENT_YEAR}-09-30`,
  4: `${CURRENT_YEAR}-12-31`,
};
const QUARTER_RANGE_LABEL: Record<number, string> = {
  1: 'Jan–Mar', 2: 'Apr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dec',
};

// ── Component ────────────────────────────────────────────────────────────
const CompanyBusinessPlanning = () => {
  const { user } = useAuth();
  const { orgId } = useTenant();
  const { isAdmin } = useUserRole();
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [hasCompanyGoal, setHasCompanyGoal] = useState(true);
  const { metadata: dealMetadataMap, loading: metaLoading } = useDealMetadata();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [agentGoals, setAgentGoals] = useState<AgentGoalRow[]>([]);
  const [closedDealsList, setClosedDealsList] = useState<{ gci: number; date: string }[]>([]);
  const [pendingDealsList, setPendingDealsList] = useState<{ gci: number; date: string }[]>([]);
  const [companyDealGoal, setCompanyDealGoal] = useState(0);
  const [companyGciGoal, setCompanyGciGoal] = useState(0);
  const [quarterlyDealGoals, setQuarterlyDealGoals] = useState<{ q1: number; q2: number; q3: number; q4: number }>({ q1: 0, q2: 0, q3: 0, q4: 0 });
  // Actuals scoped to the elapsed period (Jan 1 → end of the CURRENT quarter)
  const [periodActuals, setPeriodActuals] = useState<{ closed: number; pending: number; rawClosed: number; rawPending: number }>({ closed: 0, pending: 0, rawClosed: 0, rawPending: 0 });
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary>({ totalClients: 0, buyers: 0, sellers: 0, projectedGci: 0, weightedTotal: 0, leaseCount: 0, qualifiedClients: 0, qualifiedWeighted: 0, qualifiedBuyers: 0, qualifiedSellers: 0, qualifiedLeases: 0, qualifiedGci: 0, leadCount: 0, finishedCount: 0, enteredThisYear: 0, priorYearCount: 0 });
  // Company conversion rate: null until this team sets one, then the platform default applies.
  const [companyConversionRate, setCompanyConversionRate] = useState<number | null>(null);
  const [conversionTotals, setConversionTotals] = useState<ConversionTotals>({ contacts_made: 0, dials: 0, appointments_set: 0, appointments_held: 0, pipeline_additions: 0, contracts_signed: 0, firm_deals: 0 });
  // Raw weekly rows, kept so rates can be measured on a paired basis (see funnelRates).
  const [weeklyRows, setWeeklyRows] = useState<Weekly411Raw[]>([]);
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  // Team's own funnel assumptions, null per-field until an owner sets one.
  const [funnelAssumptions, setFunnelAssumptions] = useState<FunnelAssumptions>({});
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
    if (!metaLoading && orgId) fetchAll();
  }, [metaLoading, orgId]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFubMetrics(), fetchAgentGoals(), fetchCompanyGoals(), fetchRecruiting(), fetchPipeline(), fetchConversions()]);
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

      // Weighted deal metrics
      const wClosed = sumWeightedDeals(closedDeals, dealMetadataMap);
      const wPending = sumWeightedDeals(pendingDeals, dealMetadataMap);
      const wPipeline = sumWeightedDeals(pipelineDeals, dealMetadataMap);
      const closedDebug = buildWeightedDebug(closedDeals, dealMetadataMap);
      const pendingDebugInfo = buildWeightedDebug(pendingDeals, dealMetadataMap);
      const pipelineDebugInfo = buildWeightedDebug(pipelineDeals, dealMetadataMap);

      // Store closed deals with dates for the GCI chart
      setClosedDealsList(
        closedDeals.map(d => ({
          gci: d.commissionValue || d.agentCommission || 0,
          date: d.projectedCloseDate || d.createdAt || '',
        })).filter(d => d.date)
      );
      // Store pending deals for the GCI chart
      setPendingDealsList(
        pendingDeals.map(d => ({
          gci: d.commissionValue || d.agentCommission || 0,
          date: d.projectedCloseDate || d.createdAt || '',
        })).filter(d => d.date)
      );

      // Actuals for the elapsed period only: Jan 1 → end of the CURRENT quarter.
      // Both closed and pending are date-filtered so the carryover gap compares
      // like-for-like against the goals for those same quarters.
      const periodStart = `${CURRENT_YEAR}-01-01`;
      const periodEnd = QUARTER_END_DATE[CURRENT_QUARTER];
      const inPeriod = (d: FUBDeal) => {
        const cd = (d as any).closedDate || (d as any).closeDate || d.projectedCloseDate || '';
        return !!cd && cd >= periodStart && cd <= periodEnd;
      };
      const periodClosed = closedDeals.filter(inPeriod);
      const periodPending = pendingDeals.filter(inPeriod);
      setPeriodActuals({
        closed: Math.round(sumWeightedDeals(periodClosed, dealMetadataMap) * 100) / 100,
        pending: Math.round(sumWeightedDeals(periodPending, dealMetadataMap) * 100) / 100,
        rawClosed: periodClosed.length,
        rawPending: periodPending.length,
      });

      setMetrics({
        closedDeals: closedDeals.length,
        pendingDeals: pendingDeals.length,
        activeListings: activeListings.length,
        totalPipeline: pipelineDeals.length,
        grossGciClosed: closedDeals.reduce((s, d) => s + (d.commissionValue || d.agentCommission || 0), 0),
        grossGciPending: pendingDeals.reduce((s, d) => s + (d.commissionValue || d.agentCommission || 0), 0),
        weightedClosed: Math.round(wClosed * 100) / 100,
        weightedPending: Math.round(wPending * 100) / 100,
        weightedPipeline: Math.round(wPipeline * 100) / 100,
        leasesClosed: closedDebug.leaseCount,
        leasesPending: pendingDebugInfo.leaseCount,
        leasesInPipeline: pipelineDebugInfo.leaseCount,
        weightedDebug: closedDebug,
      });
    } catch (err) {
      console.error('CompanyBP: FUB fetch error', err);
    }
  };

  // ── 2. Agent goals ──
  const fetchAgentGoals = async () => {
    const [goalsRes, profilesRes, assumptionsRes] = await Promise.all([
      supabase.from('production_goals').select('user_id, annual_units_goal, annual_gci_goal, annual_volume_goal').eq('org_id', orgId).eq('year', CURRENT_YEAR),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('planning_assumptions').select('user_id, split_percent').eq('year', CURRENT_YEAR),
    ]);
    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name || 'Unknown']));
    // Build a map of agent split percentages so we can reverse net GCI → gross GCI
    const splitMap = new Map((assumptionsRes.data || []).map((a: any) => [a.user_id, Number(a.split_percent) || 100]));
    setAgentGoals(
      (goalsRes.data || []).map(g => {
        const splitPct = splitMap.get(g.user_id) ?? 100;
        // annual_gci_goal is the agent's net GCI (after split).
        // Gross GCI = net / (split% / 100)  so the company sees true production.
        const netGci = g.annual_gci_goal || 0;
        const grossGci = splitPct > 0 && splitPct < 100 ? Math.round(netGci / (splitPct / 100)) : netGci;
        return {
          agentName: profileMap.get(g.user_id) || 'Unknown',
          userId: g.user_id,
          dealGoal: g.annual_units_goal || 0,
          gciGoal: grossGci,
          volumeGoal: g.annual_volume_goal || 0,
        };
      }),
    );
  };

  // ── 3. Company goals ──
  const fetchCompanyGoals = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('company_goals')
      .select('annual_deals_goal, annual_gci_goal, monthly_goals, conversion_rate, funnel_assumptions')
      .eq('org_id', orgId)
      .eq('year', CURRENT_YEAR)
      .maybeSingle();
    setHasCompanyGoal(!!data);
    const storedRate = data && data.conversion_rate != null ? Number(data.conversion_rate) : null;
    setCompanyConversionRate(storedRate != null && storedRate > 0 ? storedRate : null);
    const fa = (data as any)?.funnel_assumptions;
    setFunnelAssumptions(fa && typeof fa === 'object' && !Array.isArray(fa) ? fa as FunnelAssumptions : {});
    if (!data) {
      setCompanyDealGoal(0);
      setCompanyGciGoal(0);
      setQuarterlyDealGoals({ q1: 0, q2: 0, q3: 0, q4: 0 });
    }
    if (data) {
      setCompanyDealGoal(data.annual_deals_goal || 0);
      setCompanyGciGoal(data.annual_gci_goal || 0);
      // Parse quarterly deal goals
      const raw = data.monthly_goals as any;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.quarterly) {
        const qArr = raw.quarterly as { quarter: number; deals: number }[];
        const qMap = { q1: 0, q2: 0, q3: 0, q4: 0 };
        qArr.forEach(q => {
          if (q.quarter === 1) qMap.q1 = q.deals || 0;
          if (q.quarter === 2) qMap.q2 = q.deals || 0;
          if (q.quarter === 3) qMap.q3 = q.deals || 0;
          if (q.quarter === 4) qMap.q4 = q.deals || 0;
        });
        setQuarterlyDealGoals(qMap);
      } else {
        // Fallback: divide annual evenly
        const perQ = Math.ceil((data.annual_deals_goal || 0) / 4);
        setQuarterlyDealGoals({ q1: perQ, q2: perQ, q3: perQ, q4: perQ });
      }
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

  // ── 5. Team pipeline ──
  const fetchPipeline = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('pipeline_clients')
      .select('client_type, projected_gci, deal_category, stage, created_at')
      .eq('org_id', orgId);
    const clients = data || [];
    const isLeaseLike = (c: any) =>
      c.deal_category === 'lease' || c.client_type === 'tenant' || c.client_type === 'landlord';
    const weigh = (list: any[]) =>
      Math.round(list.reduce((sum, c) => sum + (isLeaseLike(c) ? 1 / 3 : 1), 0) * 100) / 100;

    // Pipeline = everyone entered this year, Leads included, minus records already
    // finished (closed or dead). The conversion rate covers the same population.
    const yearStart = new Date(CURRENT_YEAR, 0, 1);
    const enteredThisYear = clients.filter(c => new Date(c.created_at) >= yearStart);
    const active = enteredThisYear.filter(c => ACTIVE_PIPELINE_STAGES.includes(Number(c.stage)));
    const leads = active.filter(c => Number(c.stage) === LEAD_STAGE);

    setPipelineSummary({
      totalClients: clients.length,
      buyers: clients.filter(c => c.client_type === 'buyer').length,
      sellers: clients.filter(c => c.client_type === 'seller').length,
      projectedGci: clients.reduce((s, c) => s + Number(c.projected_gci || 0), 0),
      weightedTotal: weigh(clients),
      leaseCount: clients.filter(isLeaseLike).length,
      qualifiedClients: active.length,
      qualifiedWeighted: weigh(active),
      qualifiedBuyers: active.filter(c => c.client_type === 'buyer').length,
      qualifiedSellers: active.filter(c => c.client_type === 'seller').length,
      qualifiedLeases: active.filter(isLeaseLike).length,
      qualifiedGci: active.reduce((s, c) => s + Number(c.projected_gci || 0), 0),
      leadCount: leads.length,
      finishedCount: enteredThisYear.length - active.length,
      enteredThisYear: enteredThisYear.length,
      priorYearCount: clients.length - enteredThisYear.length,
    });
  };

  // ── 6. Team conversion rates ──
  const fetchConversions = async () => {
    if (!orgId) return;
    const fromStr = format(startOfYear(new Date()), 'yyyy-MM-dd');
    const toStr = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('weekly_411')
      .select('week_start_date, user_id, contacts_made, dials, appointments_set, appointments_held, pipeline_additions, contracts_signed, firm_deals, calls_actual, appointments_actual, contracts_actual')
      .eq('org_id', orgId)
      .gte('week_start_date', fromStr)
      .lte('week_start_date', toStr);

    const rows = (data || []) as Weekly411Raw[];
    setWeeklyRows(rows);

    const totals: ConversionTotals = { contacts_made: 0, dials: 0, appointments_set: 0, appointments_held: 0, pipeline_additions: 0, contracts_signed: 0, firm_deals: 0 };
    rows.forEach(row => {
      const n = normalize411Row(row);
      totals.contacts_made += n.contacts_made;
      totals.dials += n.dials;
      totals.appointments_set += n.appointments_set;
      totals.appointments_held += n.appointments_held;
      totals.pipeline_additions += n.pipeline_additions;
      totals.contracts_signed += n.contracts_signed;
      totals.firm_deals += n.firm_deals;
    });
    setConversionTotals(totals);
  };

  // ── 6b. Active producing agents (operations, clients and admins excluded) ──
  const fetchActiveAgents = async () => {
    if (!orgId) return;
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('member_type', 'agent');
    setActiveAgentCount(count || 0);
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

  // Projections (use weighted)
  const monthsElapsed = new Date().getMonth() + 1;
  const weightedClosedTotal = metrics?.weightedClosed || 0;
  const weightedPendingTotal = metrics?.weightedPending || 0;
  const projectedClosings = monthsElapsed > 0 ? Math.round(((weightedClosedTotal) / monthsElapsed) * 12 * 100) / 100 : 0;
  const projectedGci = monthsElapsed > 0 ? Math.round(((metrics?.grossGciClosed || 0) / monthsElapsed) * 12) : 0;

  // Pipeline deficit analysis (mirrors agent pipeline planning model) — ALL WEIGHTED
  // Conversion rate: the team's own setting if it has one, otherwise the platform default.
  const usingDefaultConversion = companyConversionRate == null;
  const conversionRate = companyConversionRate ?? DEFAULT_CONVERSION_RATE;
  const FALLOUT_RATE = 1 - conversionRate;
  // Suggested rate, measured over the SAME population the pipeline counts:
  // of everyone entered into the pipeline this year, what share has closed.
  // Approximate — some closings come from clients entered in an earlier year, and
  // clients entered recently have not had time to close — so it is a suggestion only.
  const measuredConversionPct = pipelineSummary.enteredThisYear > 0
    ? Math.round(((metrics?.weightedClosed || 0) / pipelineSummary.enteredThisYear) * 1000) / 10
    : null;
  const measuredConversionBasis = pipelineSummary.enteredThisYear > 0
    ? `${formatWeightedDeals(metrics?.weightedClosed || 0)} closed ÷ ${pipelineSummary.enteredThisYear} entered in ${CURRENT_YEAR}`
    : null;
  const quarter = CURRENT_QUARTER;

  // ── Period-correct model ──
  // Elapsed period = Q1 … current quarter. Goals and actuals both cover that window.
  const elapsedQuarters = Array.from({ length: quarter }, (_, i) => i + 1);
  const elapsedGoal = Math.round(
    elapsedQuarters.reduce((sum, q) => sum + (quarterlyDealGoals[`q${q}` as 'q1' | 'q2' | 'q3' | 'q4'] || 0), 0) * 100,
  ) / 100;
  const elapsedLabel = quarter === 1 ? 'Q1 (Jan–Mar)' : `Q1–Q${quarter} (Jan–${QUARTER_RANGE_LABEL[quarter].split('–')[1]})`;
  const elapsedShort = quarter === 1 ? 'Q1' : `Q1–Q${quarter}`;
  const periodEndLabel = QUARTER_RANGE_LABEL[quarter].split('–')[1];

  // Actuals for that same window (weighted): closed + pending expected to close by quarter end
  const periodProductionWeighted = Math.round((periodActuals.closed + periodActuals.pending) * 100) / 100;
  const periodProductionRaw = periodActuals.rawClosed + periodActuals.rawPending;

  // Cumulative carryover gap — positive = behind, negative = ahead
  const carryoverGap = Math.round((elapsedGoal - periodProductionWeighted) * 100) / 100;
  const carryoverDeficit = Math.max(0, carryoverGap);
  const carryoverSurplus = Math.max(0, -carryoverGap);

  // Next quarter to plan for
  const nextQuarter = quarter < 4 ? quarter + 1 : 1;
  const nextQuarterIsNextYear = quarter === 4;
  const nextQuarterGoal = nextQuarterIsNextYear
    ? 0
    : quarterlyDealGoals[`q${nextQuarter}` as 'q1' | 'q2' | 'q3' | 'q4'] || 0;
  const nextQuarterLabel = nextQuarterIsNextYear
    ? `Q1 ${CURRENT_YEAR + 1}`
    : `Q${nextQuarter} (${QUARTER_RANGE_LABEL[nextQuarter]})`;

  const currentQGoal = quarterlyDealGoals[`q${quarter}` as 'q1' | 'q2' | 'q3' | 'q4'] || 0;
  const totalClosingsNeeded = Math.round((nextQuarterGoal + carryoverDeficit) * 100) / 100;

  // Required pipeline (weighted units) and deficit/surplus
  const requiredPipelineDeals = totalClosingsNeeded > 0 ? Math.ceil(totalClosingsNeeded / conversionRate) : 0;
  // Everyone entered into the pipeline this year and still live, Leads included —
  // the same population the conversion rate is measured over.
  const currentPipelineWeighted = pipelineSummary.qualifiedWeighted;
  const pipelineDeficit = Math.max(0, Math.round((requiredPipelineDeals - currentPipelineWeighted) * 100) / 100);
  const pipelineSurplus = Math.max(0, Math.round((currentPipelineWeighted - requiredPipelineDeals) * 100) / 100);

  // ── Required activity: turn the pipeline gap into dials, conversations, appointments ──
  // Every rate goes through the reliability check first; a failed rate is never consumed.
  const measuredRates = useMemo(() => ({
    contactToPipeline: computeFunnelRate(weeklyRows, 'pipeline_additions', 'contacts_made'),
    dialsToContact: computeFunnelRate(weeklyRows, 'contacts_made', 'dials'),
    contactToApptSet: computeFunnelRate(weeklyRows, 'appointments_set', 'contacts_made'),
    apptHeldToContract: computeFunnelRate(weeklyRows, 'contracts_signed', 'appointments_held'),
    apptHeldToFirm: computeFunnelRate(weeklyRows, 'firm_deals', 'appointments_held'),
    dialsToApptSet: computeFunnelRate(weeklyRows, 'appointments_set', 'dials'),
    dialsToPipeline: computeFunnelRate(weeklyRows, 'pipeline_additions', 'dials'),
  }), [weeklyRows]);

  /** An override wins over the measured rate; otherwise the measured rate if it is reliable. */
  const resolveRate = (override: number | null | undefined, measured: FunnelRate) => {
    if (override != null && override > 0) {
      return { rate: override / 100, source: 'company setting' as const, measured };
    }
    if (measured.ok && measured.rate) {
      return { rate: measured.rate, source: 'measured' as const, measured };
    }
    return { rate: null, source: 'unavailable' as const, measured };
  };

  const rContactToPipeline = resolveRate(funnelAssumptions.contact_to_pipeline_pct, measuredRates.contactToPipeline);
  const rDialsToContact = resolveRate(funnelAssumptions.dials_to_contact_pct, measuredRates.dialsToContact);
  const rContactToApptSet = resolveRate(funnelAssumptions.contact_to_appt_set_pct, measuredRates.contactToApptSet);

  // Whole weeks left in the current quarter, floored at 1 so the maths stays usable.
  const weeksLeftInQuarter = Math.max(1, Math.floor(
    (new Date(QUARTER_END_DATE[quarter]).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000),
  ));
  const agentDivisor = Math.max(1, activeAgentCount);

  // Actual pace over the last 8 weeks, from the same weekly records.
  const PACE_WEEKS = 8;
  const paceRows = useMemo(() => {
    const cutoff = format(addWeeks(new Date(), -PACE_WEEKS), 'yyyy-MM-dd');
    return weeklyRows.filter(r => (r.week_start_date || '') >= cutoff);
  }, [weeklyRows]);
  const pacePerWeek = (metric: Parameters<typeof totalMetric>[1]) =>
    Math.round((totalMetric(paceRows, metric) / PACE_WEEKS) * 10) / 10;

  const pipelineUnitsNeeded = pipelineDeficit;
  const conversationsNeeded = rContactToPipeline.rate ? Math.ceil(pipelineUnitsNeeded / rContactToPipeline.rate) : null;
  const dialsNeeded = conversationsNeeded != null && rDialsToContact.rate ? Math.ceil(conversationsNeeded / rDialsToContact.rate) : null;
  const apptsNeeded = conversationsNeeded != null && rContactToApptSet.rate ? Math.ceil(conversationsNeeded * rContactToApptSet.rate) : null;

  const activityRows = [
    {
      key: 'pipeline',
      label: 'Pipeline additions',
      needed: pipelineUnitsNeeded > 0 ? Math.ceil(pipelineUnitsNeeded) : 0,
      pace: pacePerWeek('pipeline_additions'),
      rate: null as null | typeof rContactToPipeline,
      rateLabel: null as string | null,
    },
    {
      key: 'conversations',
      label: 'Conversations',
      needed: conversationsNeeded,
      pace: pacePerWeek('contacts_made'),
      rate: rContactToPipeline,
      rateLabel: 'Conversation → pipeline',
    },
    {
      key: 'dials',
      label: 'Dials',
      needed: dialsNeeded,
      pace: pacePerWeek('dials'),
      rate: rDialsToContact,
      rateLabel: 'Dial → conversation',
    },
    {
      key: 'appointments',
      label: 'Appointments set',
      needed: apptsNeeded,
      pace: pacePerWeek('appointments_set'),
      rate: rContactToApptSet,
      rateLabel: 'Conversation → appointment set',
    },
  ];

  // Year-to-date totals (still used by other sections of the page)
  const companyProductionRaw = (metrics?.closedDeals || 0) + (metrics?.pendingDeals || 0);

  // Keep old calc for other sections
  const closedAndPending = companyProductionRaw;
  const remainingDealsNeeded = Math.max(0, companyDealGoal - closedAndPending);
  const pipelineNeeded = remainingDealsNeeded > 0 ? Math.ceil(remainingDealsNeeded / conversionRate) : 0;
  const pipelineGap = pipelineDeficit;

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-gold font-display flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Company Business Planning — {CURRENT_YEAR}
          </CardTitle>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setGoalDialogOpen(true)}>
              <Target className="h-4 w-4 mr-1" /> {hasCompanyGoal ? 'Edit company goal' : 'Set company goal'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CompanyGoalDialog
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
          year={CURRENT_YEAR}
          onSaved={fetchCompanyGoals}
          suggestedConversionPct={measuredConversionPct}
        />
        {!hasCompanyGoal && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-600">No company goal has been set for {CURRENT_YEAR}.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin
                ? 'Use “Set company goal” above to enter your annual target, and optionally a per-quarter breakdown.'
                : 'Ask an owner or admin to set your team’s annual target.'}
            </p>
          </div>
        )}
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
            <TabsTrigger value="deal-sources" className="flex items-center gap-1 text-xs sm:text-sm">
              <PieChart className="h-3.5 w-3.5" /> Deal Sources
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Company Performance Reality ── */}
          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Closed units — YTD, sales + leases" value={formatWeightedDeals(metrics?.weightedClosed || 0)} icon={<Target className="h-4 w-4 text-green-500" />} sub={metrics?.leasesClosed ? `${metrics.closedDeals} raw · ${metrics.leasesClosed} leases (0.33 each)` : `${metrics?.closedDeals || 0} raw · no leases`} />
              <MetricCard label="Gross GCI — closed only, YTD, sales + leases" value={formatCurrency(metrics?.grossGciClosed)} icon={<DollarSign className="h-4 w-4 text-green-500" />} sub="Excludes pending and conditional" />
              <MetricCard label="Pending units — sales + leases" value={formatWeightedDeals(metrics?.weightedPending || 0)} icon={<TrendingUp className="h-4 w-4 text-gold" />} sub={metrics?.leasesPending ? `${metrics.pendingDeals} raw · ${metrics.leasesPending} leases (0.33 each)` : `${metrics?.pendingDeals || 0} raw · not yet closed`} />
              <MetricCard label="Active Listings" value={metrics?.activeListings || 0} icon={<Building2 className="h-4 w-4 text-blue-500" />} sub="Open listings today" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard label="Live FUB deals (weighted)" value={formatWeightedDeals(metrics?.weightedPipeline || 0)} icon={<Users className="h-4 w-4 text-purple-500" />} sub={`${metrics?.totalPipeline || 0} open deals in Follow Up Boss · not the client pipeline below`} />
              <MetricCard label="Projected Year-End units — sales + leases" value={formatWeightedDeals(projectedClosings)} icon={<TrendingUp className="h-4 w-4 text-amber-500" />} sub={`Based on ${monthsElapsed} months pace`} />
              <MetricCard label="Projected Year-End GCI — closed basis" value={formatCurrency(projectedGci)} icon={<DollarSign className="h-4 w-4 text-amber-500" />} sub={`Based on ${monthsElapsed} months pace`} />
            </div>

            {/* Team Pipeline */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-gold" /> Team Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    label={`Pipeline (weighted) — everyone entered ${CURRENT_YEAR}`}
                    value={formatWeightedDeals(pipelineSummary.qualifiedWeighted)}
                    icon={<Users className="h-4 w-4 text-blue-500" />}
                    sub={pipelineSummary.qualifiedLeases > 0
                      ? `${pipelineSummary.qualifiedClients} live records · ${pipelineSummary.qualifiedLeases} leases`
                      : `${pipelineSummary.qualifiedClients} live records`}
                  />
                  <MetricCard label="Buyers in pipeline" value={pipelineSummary.qualifiedBuyers} icon={<Users className="h-4 w-4 text-emerald-500" />} />
                  <MetricCard label="Sellers in pipeline" value={pipelineSummary.qualifiedSellers} icon={<Building2 className="h-4 w-4 text-amber-500" />} />
                  <MetricCard label="Projected GCI — pipeline, not yet closed" value={formatCurrency(pipelineSummary.qualifiedGci)} icon={<DollarSign className="h-4 w-4 text-gold" />} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Pipeline = everyone entered into the pipeline in {CURRENT_YEAR}, Leads included — the conversion rate is measured
                  over that same population, so lead fallout is already priced into the rate.
                  {' '}{pipelineSummary.qualifiedClients} of {pipelineSummary.enteredThisYear} records entered this year
                  {pipelineSummary.leadCount > 0 ? ` · includes ${pipelineSummary.leadCount} leads` : ''}
                  {pipelineSummary.finishedCount > 0 ? ` · ${pipelineSummary.finishedCount} finished (closed or dead) excluded` : ''}
                  {pipelineSummary.priorYearCount > 0 ? ` · ${pipelineSummary.priorYearCount} entered before ${CURRENT_YEAR} excluded` : ''}.
                  Leases count as 0.33 deal units; no stage-probability weighting is applied.
                </p>
              </CardContent>
            </Card>

            {/* Pipeline Deficit Analysis */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-gold" /> Pipeline Deficit Analysis
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs max-w-[200px]">All deal counts are weighted: leases count as 0.33 deal units.</p></TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                 {currentQGoal === 0 && companyDealGoal === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-sm font-medium text-amber-600">Set company quarterly deal goals to enable pipeline deficit analysis.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border bg-card p-4 space-y-2 font-mono text-sm">
                      {/* Goal for every elapsed quarter */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Goal {elapsedLabel}</span>
                        <span className="font-bold text-foreground">{formatWeightedDeals(elapsedGoal)} deal units</span>
                      </div>
                      {/* Actuals for that SAME period */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Closed + Pending {elapsedLabel} (weighted)</span>
                        <span className="font-bold text-foreground">{formatWeightedDeals(periodProductionWeighted)} deal units</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span>
                          Raw: {periodProductionRaw} deals ({periodActuals.rawClosed} closed, {periodActuals.rawPending} pending due by end of {periodEndLabel})
                        </span>
                      </div>
                      {/* Cumulative carryover — may be a deficit or a surplus */}
                      <div className={`flex items-center justify-between ${carryoverDeficit > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        <span>Carryover ({elapsedShort} gap)</span>
                        <span className="font-bold">
                          {carryoverDeficit > 0
                            ? `+${formatWeightedDeals(carryoverDeficit)}`
                            : carryoverSurplus > 0
                              ? `−${formatWeightedDeals(carryoverSurplus)} (ahead)`
                              : '0'} deal units
                        </span>
                      </div>
                      {/* Next quarter goal */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Goal {nextQuarterLabel}</span>
                        <span className="font-bold text-foreground">
                          {nextQuarterIsNextYear ? 'not set' : `${formatWeightedDeals(nextQuarterGoal)} deal units`}
                        </span>
                      </div>
                      <Separator />
                      {/* Total Closings Needed */}
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-foreground">Total Closings Needed ({nextQuarterLabel}{carryoverDeficit > 0 ? ' + carryover' : ''})</span>
                        <span className="text-foreground">{formatWeightedDeals(totalClosingsNeeded)} deal units</span>
                      </div>
                      {/* Conversion Rate */}
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>÷ Conversion Rate ({(conversionRate * 100).toFixed(conversionRate * 100 % 1 === 0 ? 0 : 1)}%)</span>
                        <span className="text-xs">
                          ({Math.round(FALLOUT_RATE * 1000) / 10}% fallout · {usingDefaultConversion ? 'platform default' : 'company setting'})
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground -mt-1">
                        Measured over {CONVERSION_POPULATION} — the same population the pipeline below counts.
                      </div>
                      {usingDefaultConversion && (
                        <div className="text-xs text-muted-foreground">
                          Your team has not set a conversion rate yet, so the platform default of {Math.round(DEFAULT_CONVERSION_RATE * 100)}% is used.
                          {measuredConversionPct != null && ` Your own history this year suggests ${measuredConversionPct}% (${measuredConversionBasis}).`}
                          {isAdmin && ' Set your own under “Edit company goal”.'}
                        </div>
                      )}
                      <Separator />
                      {/* Required Pipeline */}
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-foreground">Required Pipeline (for {nextQuarterLabel})</span>
                        <span className="text-foreground">{requiredPipelineDeals} deal units</span>
                      </div>
                      {/* Current qualified pipeline (weighted) */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Qualified Pipeline today (weighted)</span>
                        <span className="font-bold text-foreground">{formatWeightedDeals(currentPipelineWeighted)} deal units</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span>
                          {pipelineSummary.qualifiedClients} qualified of {pipelineSummary.totalClients} client records
                          {pipelineSummary.leadCount > 0 ? ` · ${pipelineSummary.leadCount} leads excluded` : ''}
                          {pipelineSummary.finishedCount > 0 ? ` · ${pipelineSummary.finishedCount} finished excluded` : ''}
                          {pipelineSummary.qualifiedLeases > 0 ? ` · ${pipelineSummary.qualifiedLeases} leases` : ''}
                        </span>
                      </div>
                      <Separator />
                      {/* Deficit or Surplus */}
                      <div className="flex items-center justify-between">
                        {pipelineDeficit > 0 ? (
                          <>
                            <span className="font-bold text-destructive">= Pipeline Deficit</span>
                            <span className="text-lg font-bold text-destructive">{formatWeightedDeals(pipelineDeficit)} more deal units needed</span>
                          </>
                        ) : pipelineSurplus > 0 ? (
                          <>
                            <span className="font-bold text-green-600">= Pipeline Surplus</span>
                            <span className="text-lg font-bold text-green-600">+{formatWeightedDeals(pipelineSurplus)} deal units ahead</span>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-green-600">= Pipeline Covered</span>
                            <span className="text-lg font-bold text-green-600">On track ✓</span>
                          </>
                        )}
                      </div>
                    </div>
                    {pipelineDeficit > 0 && (
                      <Badge className="mt-3 bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20">
                        Pipeline Deficit: {formatWeightedDeals(pipelineDeficit)} deal units needed
                      </Badge>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Team Conversion Rates */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-gold" /> Team Conversion Rates (YTD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Contact → Appt Set', val: pctFmt(conversionTotals.appointments_set, conversionTotals.contacts_made), sub: `${conversionTotals.appointments_set}/${conversionTotals.contacts_made}` },
                    { label: 'Dials → Appt Set', val: pctFmt(conversionTotals.appointments_set, conversionTotals.dials), sub: `${conversionTotals.appointments_set}/${conversionTotals.dials}` },
                    { label: 'Contact → Pipeline', val: pctFmt(conversionTotals.pipeline_additions, conversionTotals.contacts_made), sub: `${conversionTotals.pipeline_additions}/${conversionTotals.contacts_made}` },
                    { label: 'Appt Held → Contract', val: pctFmt(conversionTotals.contracts_signed, conversionTotals.appointments_held), sub: `${conversionTotals.contracts_signed}/${conversionTotals.appointments_held}` },
                    { label: 'Appt Held → Firm Deal', val: pctFmt(conversionTotals.firm_deals, conversionTotals.appointments_held), sub: `${conversionTotals.firm_deals}/${conversionTotals.appointments_held}` },
                    { label: 'Dials → Pipeline', val: pctFmt(conversionTotals.pipeline_additions, conversionTotals.dials), sub: `${conversionTotals.pipeline_additions}/${conversionTotals.dials}` },
                  ].map(m => (
                    <div key={m.label} className="text-center p-3 rounded-lg border border-border bg-muted/20">
                      <p className="text-xl font-bold text-foreground">{m.val}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-1">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.sub}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* GCI Pace Chart */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-gold" /> GCI Pace vs Target
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GciPaceChart closedDeals={closedDealsList} pendingDeals={pendingDealsList} gciGoal={companyGciGoal} />
              </CardContent>
            </Card>
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
          {/* ── TAB 5: Deal Sources ── */}
          <TabsContent value="deal-sources">
            <DealSourcesTab companyDealGoal={companyDealGoal} isAdmin={true} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// ── GCI Pace Chart ──
const GciPaceChart = ({ closedDeals, pendingDeals, gciGoal }: { closedDeals: { gci: number; date: string }[]; pendingDeals: { gci: number; date: string }[]; gciGoal: number }) => {
  const chartData = useMemo(() => {
    const now = new Date();
    const currentWeekNum = getWeek(now, { weekStartsOn: 1 });
    const totalWeeks = 52;
    const weeklyTarget = gciGoal / totalWeeks;

    const weekGciClosed = new Array(totalWeeks).fill(0);
    closedDeals.forEach(d => {
      try {
        const dealWeek = getWeek(parseISO(d.date), { weekStartsOn: 1 });
        if (dealWeek >= 1 && dealWeek <= totalWeeks) weekGciClosed[dealWeek - 1] += d.gci;
      } catch {}
    });

    const weekGciPending = new Array(totalWeeks).fill(0);
    pendingDeals.forEach(d => {
      try {
        const dealWeek = getWeek(parseISO(d.date), { weekStartsOn: 1 });
        if (dealWeek >= 1 && dealWeek <= totalWeeks) weekGciPending[dealWeek - 1] += d.gci;
      } catch {}
    });

    const weeks: { week: number; weekLabel: string; gci: number | null; target: number }[] = [];
    let runningTotal = 0;

    for (let w = 0; w < totalWeeks; w++) {
      runningTotal += weekGciClosed[w] + weekGciPending[w];
      weeks.push({
        week: w + 1,
        weekLabel: `W${w + 1}`,
        gci: w < currentWeekNum ? Math.round(runningTotal) : null,
        target: Math.round(weeklyTarget * (w + 1)),
      });
    }

    return weeks;
  }, [closedDeals, pendingDeals, gciGoal]);

  if (gciGoal === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Set a company GCI goal to see the pace chart.</p>;
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={3} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: number, name: string) => [
              `$${value.toLocaleString()}`,
              name === 'target' ? 'Target Pace' : 'Closed + Pending GCI',
            ]}
          />
          <Legend />
          <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={2} dot={false} name="Target Pace" />
          <Line type="monotone" dataKey="gci" stroke="hsl(43, 74%, 49%)" strokeWidth={2.5} dot={false} name="Closed + Pending GCI" connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
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
