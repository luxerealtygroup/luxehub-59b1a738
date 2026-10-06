import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInCalendarDays, parseISO } from 'date-fns';

const sb = supabase as unknown as { from: (t: string) => any };

export type ScriptLevel = { id: string; level: number; name: string; description: string; pass_pct: number; passes_required: number; persona_prompt: string; grading_notes: string };
export type LevelUnlock = { agent_id: string; level: number; unlocked_at: string; unlocked_by: string; note: string | null };
export type LevelSession = { id: string; user_id: string; level: number | null; score_pct: number | null; passed: boolean | null; practice_mode: string | null; created_at: string };
export type PracticeGoal = { id: string; agent_id: string; goal_type: 'clear_levels' | 'reach_level' | 'passes_in_period'; target: number; start_date: string; due_date: string; status: string; created_by: string | null };

export const DEFAULT_LEVELS: Omit<ScriptLevel, 'id' | 'persona_prompt' | 'grading_notes'>[] = [
  { level: 1, name: 'Warm', description: 'Past clients and sphere, happy to hear from you.', pass_pct: 80, passes_required: 3 },
  { level: 2, name: 'Lukewarm', description: 'Mild hesitation: "we\'re just looking".', pass_pct: 80, passes_required: 3 },
  { level: 3, name: 'Real objections', description: '"Our friend is an agent", "why pay full commission".', pass_pct: 80, passes_required: 3 },
  { level: 4, name: 'Price and tough negotiation', description: 'Commission reduction, a seller who wants to overprice.', pass_pct: 80, passes_required: 3 },
  { level: 5, name: 'Brutal', description: 'Angry expireds, FSBOs who hang up, confrontational prospects.', pass_pct: 80, passes_required: 3 },
];

export function currentLevelOf(unlocks: LevelUnlock[], agentId: string) {
  return Math.max(1, ...unlocks.filter(u => u.agent_id === agentId).map(u => u.level));
}

/** Passing graded drills at a level (REVIEW uploads never count). Derived, never stored. */
export function passesAt(sessions: LevelSession[], agentId: string, level: number) {
  return sessions.filter(s => s.user_id === agentId && s.level === level && s.passed === true && s.practice_mode === 'drill').length;
}

export function progressFor(levels: ScriptLevel[], unlocks: LevelUnlock[], sessions: LevelSession[], agentId: string) {
  const current = currentLevelOf(unlocks, agentId);
  const cfg = levels.find(l => l.level === current) ?? (DEFAULT_LEVELS[current - 1] as ScriptLevel);
  const passes = passesAt(sessions, agentId, current);
  const recent = sessions.filter(s => s.user_id === agentId && s.level === current && s.score_pct != null && s.practice_mode === 'drill')
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  return { current, cfg, passes: Math.min(passes, cfg.passes_required), needed: cfg.passes_required, recent, maxed: current >= 5 };
}

export function goalProgress(g: PracticeGoal, unlocks: LevelUnlock[], sessions: LevelSession[]) {
  const inPeriod = (iso: string) => { const d = iso.slice(0, 10); return d >= g.start_date && d <= g.due_date; };
  let value = 0;
  if (g.goal_type === 'reach_level') value = currentLevelOf(unlocks, g.agent_id);
  else if (g.goal_type === 'clear_levels') value = unlocks.filter(u => u.agent_id === g.agent_id && inPeriod(u.unlocked_at)).length;
  else value = sessions.filter(s => s.user_id === g.agent_id && s.passed === true && s.practice_mode === 'drill' && inPeriod(s.created_at)).length;
  const daysLeft = differenceInCalendarDays(parseISO(g.due_date), new Date());
  return { value, pct: Math.min(100, Math.round((value / g.target) * 100)), done: value >= g.target, daysLeft };
}

export function goalLabel(g: PracticeGoal) {
  if (g.goal_type === 'reach_level') return `Reach Level ${g.target}`;
  if (g.goal_type === 'clear_levels') return `Clear ${g.target} level${g.target === 1 ? '' : 's'}`;
  return `${g.target} passing drills`;
}

/** Loads levels, unlocks, level-tagged sessions and goals. RLS scopes rows: agents get their own, owners/admins their brokerage. */
export function useScriptProgress(agentId?: string | null) {
  const [state, setState] = useState<{ levels: ScriptLevel[]; unlocks: LevelUnlock[]; sessions: LevelSession[]; goals: PracticeGoal[]; loading: boolean }>(
    { levels: [], unlocks: [], sessions: [], goals: [], loading: true });
  const reload = useCallback(async () => {
    const scope = (q: any, col: string) => (agentId ? q.eq(col, agentId) : q);
    const [l, u, s, g] = await Promise.all([
      sb.from('script_levels').select('*').order('level'),
      scope(sb.from('level_unlocks').select('agent_id, level, unlocked_at, unlocked_by, note'), 'agent_id'),
      scope(sb.from('practice_sessions').select('id, user_id, level, score_pct, passed, practice_mode, created_at').not('level', 'is', null), 'user_id'),
      scope(sb.from('practice_goals').select('*').order('due_date'), 'agent_id'),
    ]);
    setState({ levels: l.data ?? [], unlocks: u.data ?? [], sessions: s.data ?? [], goals: g.data ?? [], loading: false });
  }, [agentId]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
