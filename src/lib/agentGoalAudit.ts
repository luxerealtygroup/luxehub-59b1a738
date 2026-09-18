import { supabase } from '@/integrations/supabase/client';

export type AgentGoalAuditField =
  | 'annual_deals_goal'
  | 'annual_gci_goal'
  | 'monthly_plan'
  | 'plan_assumptions';

export const AGENT_GOAL_FIELD_LABELS: Record<AgentGoalAuditField, string> = {
  annual_deals_goal: 'Annual deal goal',
  annual_gci_goal: 'Annual GCI goal',
  monthly_plan: 'Monthly breakdown',
  plan_assumptions: 'Planning assumptions',
};

export interface AgentGoalChange {
  field: AgentGoalAuditField;
  oldValue?: string | number | null;
  newValue?: string | number | null;
}

/**
 * Insert-only history of who changed an agent's goals.
 * Recorded whenever someone other than the agent makes the change.
 */
export async function logAgentGoalChanges(params: {
  agentUserId: string;
  changedBy: string;
  year: number;
  changes: AgentGoalChange[];
}): Promise<void> {
  const rows = params.changes
    .filter((c) => String(c.oldValue ?? '') !== String(c.newValue ?? ''))
    .map((c) => ({
      agent_user_id: params.agentUserId,
      changed_by: params.changedBy,
      year: params.year,
      field: c.field,
      old_value: c.oldValue == null ? null : String(c.oldValue),
      new_value: c.newValue == null ? null : String(c.newValue),
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('agent_goal_audit').insert(rows);
  if (error) console.error('Failed to record goal change history', error);
}

export interface AgentGoalAuditEntry {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
  changed_by_name?: string;
}

export async function fetchAgentGoalAudit(agentUserId: string, year: number): Promise<AgentGoalAuditEntry[]> {
  const { data, error } = await supabase
    .from('agent_goal_audit')
    .select('id, field, old_value, new_value, changed_by, created_at')
    .eq('agent_user_id', agentUserId)
    .eq('year', year)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  const changerIds = Array.from(new Set(data.map((d) => d.changed_by)));
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', changerIds);
  const names = new Map((profiles || []).map((p) => [p.id, p.full_name || 'Someone']));

  return data.map((d) => ({ ...d, changed_by_name: names.get(d.changed_by) || 'Someone' }));
}
