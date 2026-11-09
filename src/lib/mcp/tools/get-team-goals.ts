import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  requireAdmin, loadAgentDirectory, resolveAgentId, enrich, errorResult, notFound, okResult, READ_ONLY,
} from "../admin";

export default defineTool({
  name: "get_team_goals",
  title: "Get team goals (admin)",
  description:
    "Owners/admins only, read-only: returns agent goals, production goals and business-planning goals for every agent in the signed-in user's brokerage.",
  inputSchema: {
    year: z.number().int().optional().describe("Optional goal year, e.g. 2027."),
    agent_email: z.string().trim().email().optional().describe("Optional: limit to one agent by email."),
  },
  annotations: READ_ONLY,
  handler: async ({ year, agent_email }, ctx) => {
    const gate = await requireAdmin(ctx);
    if (!gate.ok) return gate.result;
    const { supabase } = gate;
    let agentId: string | null = null;
    if (agent_email) {
      agentId = await resolveAgentId(supabase, agent_email);
      if (!agentId) return notFound(agent_email);
    }

    let ag = supabase.from("agent_goals").select(
      "id, user_id, goal_type, category, target_value, current_value, period, start_date, end_date, year, updated_at",
    );
    if (year !== undefined) ag = ag.eq("year", year);
    if (agentId) ag = ag.eq("user_id", agentId);

    let pg = supabase.from("production_goals").select(
      "id, user_id, year, annual_units_goal, annual_gci_goal, annual_volume_goal, annual_focus, monthly_goals, monthly_plan, plan_assumptions, updated_at",
    );
    if (year !== undefined) pg = pg.eq("year", year);
    if (agentId) pg = pg.eq("user_id", agentId);

    let pl = supabase.from("planning_goals").select(
      "id, agent_id, plan_year, goal_input_type, net_income_goal, gci_goal, avg_sale_price, commission_rate, agent_split_pct, appt_to_close_rate, lead_to_appt_rate, gci_per_deal, net_per_deal, deals_needed, volume_needed, appointments_needed, leads_needed, status, submitted_at, approved_at, updated_at",
    );
    if (year !== undefined) pl = pl.eq("plan_year", year);
    if (agentId) pl = pl.eq("agent_id", agentId);

    const [a, p, q, dir] = await Promise.all([ag, pg, pl, loadAgentDirectory(supabase)]);
    const err = a.error ?? p.error ?? q.error;
    if (err) return errorResult(err.message);

    const agent_goals = enrich(a.data, dir, "user_id");
    const production_goals = enrich(p.data, dir, "user_id");
    const planning_goals = enrich(q.data, dir, "agent_id");
    return okResult({
      year: year ?? "all",
      agent_goals_count: agent_goals.length,
      production_goals_count: production_goals.length,
      planning_goals_count: planning_goals.length,
      agent_goals,
      production_goals,
      planning_goals,
    });
  },
});
