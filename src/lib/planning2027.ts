/**
 * 2027 Business Planning — shared maths, types and defaults.
 * The database recomputes every derived figure on save (planning_goals_guard);
 * this mirror exists only so the calculator updates live while typing.
 */
export const PLAN_YEAR = 2027;
export const WORKING_WEEKS = 48;

export type GoalStatus = 'draft' | 'submitted' | 'approved';
export type GoalInputType = 'net' | 'gci';

export interface PlanningSettings {
  id?: string;
  plan_year: number;
  commission_rate: number;
  agent_split_pct: number;
  appt_to_close_rate: number;
  lead_to_appt_rate: number;
  avg_sale_price: number;
  submission_deadline: string;
  planning_session_date: string;
  selling_agent_ids?: string[];
  defaults_source?: string | null;
}

export const DEFAULT_SETTINGS: PlanningSettings = {
  plan_year: PLAN_YEAR,
  commission_rate: 2.5,
  agent_split_pct: 70,
  appt_to_close_rate: 20,
  lead_to_appt_rate: 10,
  avg_sale_price: 800000,
  submission_deadline: '2026-10-14T03:59:00.000Z', // Oct 13 2026 11:59 PM Toronto
  planning_session_date: '2026-10-14',
};

export interface GoalInputs {
  goal_input_type: GoalInputType;
  net_income_goal: number | null;
  gci_goal: number | null;
  avg_sale_price: number | null;
  commission_rate: number | null;
  agent_split_pct: number | null;
  appt_to_close_rate: number | null;
  lead_to_appt_rate: number | null;
}

export interface GoalResults {
  net_income_goal: number | null;
  gci_goal: number | null;
  gci_per_deal: number | null;
  net_per_deal: number | null;
  deals_needed: number | null;
  volume_needed: number | null;
  appointments_needed: number | null;
  leads_needed: number | null;
}

export interface PlanningGoalRow extends GoalInputs, GoalResults {
  id: string;
  agent_id: string;
  plan_year: number;
  rate_source: string | null;
  status: GoalStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
}

export interface LeadSourceFocus { source: string; pct: number | null }
export interface Milestone { quarter: 1 | 2 | 3 | 4; deals: number | null; gci: number | null }
export interface ActionItem { action: string; due: string }

export interface PreworkRow {
  id?: string;
  agent_id?: string;
  wins_2026: string | null;
  challenges_2026: string | null;
  top_lead_sources: string | null;
  team_change_suggestion: string | null;
  stop_start_continue?: string | null;
  support_needed?: string | null;
  recap_wins?: string | null;
  recap_challenges?: string | null;
  recap_commitments?: string | null;
  recap_lead_sources?: string | null;
  weekly_conversations?: number | null;
  weekly_appointments?: number | null;
  weekly_leads?: number | null;
  lead_source_focus?: LeadSourceFocus[];
  quarterly_milestones?: Milestone[];
  action_plan?: ActionItem[];
  skills_focus?: string | null;
  personal_goal?: string | null;
  status?: 'draft' | 'submitted';
  submitted_at?: string | null;
}

export interface RecapRow {
  wins: string | null; challenges: string | null; commitments: string | null; lead_sources: string | null;
  source_counts: { coaching_sessions?: number; weekly_entries?: number };
  generated_at: string; model: string | null;
}

export const PREWORK_SAVE_KEYS = [
  'wins_2026', 'challenges_2026', 'top_lead_sources', 'team_change_suggestion', 'stop_start_continue', 'support_needed',
  'recap_wins', 'recap_challenges', 'recap_commitments', 'recap_lead_sources',
  'weekly_conversations', 'weekly_appointments', 'weekly_leads',
  'lead_source_focus', 'quarterly_milestones', 'action_plan', 'skills_focus', 'personal_goal',
] as const;

/** Evenly split deals/GCI across quarters; remainder deals go to the later (busier) quarters. */
export function splitQuarters(deals: number | null, gci: number | null): Milestone[] {
  const d = deals ?? 0;
  const base = Math.floor(d / 4), rem = d % 4;
  return ([1, 2, 3, 4] as const).map((q, i) => ({
    quarter: q,
    deals: deals == null ? null : base + (i >= 4 - rem ? 1 : 0),
    gci: gci == null ? null : Math.round(gci / 4),
  }));
}

export const pctChange = (from: number | null | undefined, to: number | null | undefined) =>
  from && to != null && from > 0 ? Math.round(((to - from) / from) * 100) : null;

const pos = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? v : null);

export function computeGoal(i: GoalInputs): GoalResults {
  const split = pos(i.agent_split_pct);
  const comm = pos(i.commission_rate);
  const price = pos(i.avg_sale_price);
  let net = i.net_income_goal;
  let gci = i.gci_goal;
  if (i.goal_input_type === 'net') {
    gci = split && net != null ? Math.round(net / (split / 100)) : null;
  } else {
    net = split && gci != null ? Math.round(gci * (split / 100)) : null;
  }
  const gciPerDeal = comm && price ? Math.round(price * (comm / 100)) : null;
  const netPerDeal = gciPerDeal && split ? Math.round(gciPerDeal * (split / 100)) : null;
  const deals = gciPerDeal && gci != null ? Math.ceil(gci / gciPerDeal) : null;
  const volume = deals != null && price ? deals * price : null;
  const a2c = pos(i.appt_to_close_rate);
  const l2a = pos(i.lead_to_appt_rate);
  const appts = deals != null && a2c ? Math.ceil(deals / (a2c / 100)) : null;
  const leads = appts != null && l2a ? Math.ceil(appts / (l2a / 100)) : null;
  return {
    net_income_goal: net ?? null, gci_goal: gci ?? null,
    gci_per_deal: gciPerDeal, net_per_deal: netPerDeal,
    deals_needed: deals, volume_needed: volume,
    appointments_needed: appts, leads_needed: leads,
  };
}

export const perMonth = (v: number | null) => (v == null ? null : Math.ceil(v / 12));
export const perWeek = (v: number | null) => (v == null ? null : Math.ceil(v / WORKING_WEEKS));

export function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatSessionDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function countdown(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'Deadline passed';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h ${m}m left`;
}
