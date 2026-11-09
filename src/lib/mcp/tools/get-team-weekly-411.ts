import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  requireAdmin, loadAgentDirectory, resolveAgentId, enrich, errorResult, notFound, okResult, READ_ONLY, DATE_RE,
} from "../admin";

const COLUMNS = [
  "id", "user_id", "week_start_date",
  "calls_goal", "calls_actual", "appointments_goal", "appointments_actual", "listings_goal", "listings_actual",
  "contracts_goal", "contracts_actual",
  "priority_1", "priority_1_completed", "priority_2", "priority_2_completed",
  "priority_3", "priority_3_completed", "priority_4", "priority_4_completed",
  "personal_priority_1", "personal_priority_1_completed", "personal_priority_2", "personal_priority_2_completed",
  "personal_priority_3", "personal_priority_3_completed",
  "wins", "challenges", "next_steps", "notes",
  "contacts_made", "dials", "doors_knocked", "appointments_set", "appointments_held", "pipeline_additions",
  "contracts_signed", "firm_deals", "database_size", "leads_received", "connects", "conversations", "texts_sent",
  "talk_time_minutes", "speed_to_first_touch_minutes", "contacts_held", "contacts_unstaged",
  "contacts_per_live_deal", "contacts_goal", "new_leads", "leads_claimed_from_pond", "calls_total",
  "calls_outbound", "calls_connected", "talk_time_seconds", "texts_received", "deals_active", "deals_created",
  "fub_conversations", "fub_pipeline_adds", "fub_agreements", "fub_pending", "fub_closed", "fub_closed_units",
  "fub_gci", "fub_speed_to_lead_minutes", "fub_emails_sent", "fub_appointments_set", "fub_appointments_held",
  "fub_synced_at", "fub_sync_status", "updated_at",
].join(", ");

function mondayMinusWeeks(weeks: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  return d.toISOString().slice(0, 10);
}

export default defineTool({
  name: "get_team_weekly_411",
  title: "Get team weekly 4-1-1 / coaching (admin)",
  description:
    "Owners/admins only, read-only: returns weekly 4-1-1 accountability entries for every agent in the signed-in user's brokerage.",
  inputSchema: {
    week_start_from: z.string().trim().regex(DATE_RE, "Use YYYY-MM-DD").optional().describe("Earliest week start (YYYY-MM-DD)."),
    week_start_to: z.string().trim().regex(DATE_RE, "Use YYYY-MM-DD").optional().describe("Latest week start (YYYY-MM-DD)."),
    weeks: z.number().int().min(1).max(52).default(8).describe("Weeks back from this Monday when week_start_from is omitted."),
    agent_email: z.string().trim().email().optional().describe("Optional: limit to one agent by email."),
    limit: z.number().int().min(1).max(2000).default(1000).describe("Maximum rows."),
  },
  annotations: READ_ONLY,
  handler: async ({ week_start_from, week_start_to, weeks, agent_email, limit }, ctx) => {
    const gate = await requireAdmin(ctx);
    if ("result" in gate) return gate.result;
    const { supabase, orgId } = gate;
    const from = week_start_from ?? mondayMinusWeeks(weeks ?? 8);
    let q = supabase
      .from("weekly_411")
      .select(COLUMNS)
      .gte("week_start_date", from)
      .order("week_start_date", { ascending: false })
      .order("user_id")
      .limit(limit ?? 1000);
    if (week_start_to) q = q.lte("week_start_date", week_start_to);
    if (agent_email) {
      const id = await resolveAgentId(supabase, orgId, agent_email);
      if (!id) return notFound(agent_email);
      q = q.eq("user_id", id);
    }
    const [{ data, error }, dir] = await Promise.all([q, loadAgentDirectory(supabase, orgId)]);
    if (error) return errorResult(error.message);
    const entries = enrich(data as unknown[] | null, dir, "user_id");
    return okResult({
      count: entries.length,
      week_start_from: from,
      week_start_to: week_start_to ?? null,
      weeks: week_start_from ? null : weeks ?? 8,
      entries,
    });
  },
});
