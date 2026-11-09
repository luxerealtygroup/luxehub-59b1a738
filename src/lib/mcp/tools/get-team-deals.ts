import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  requireAdmin, loadAgentDirectory, resolveAgentId, enrich, errorResult, notFound, okResult, READ_ONLY,
} from "../admin";

export default defineTool({
  name: "get_team_deals",
  title: "Get team deals (admin)",
  description:
    "Owners/admins only, read-only: returns deals for every agent in the signed-in user's brokerage.",
  inputSchema: {
    stage: z.string().trim().optional().describe("Optional deal stage filter."),
    limit: z.number().int().min(1).max(1000).default(500).describe("Maximum rows."),
    agent_email: z.string().trim().email().optional().describe("Optional: limit to one agent by email."),
  },
  annotations: READ_ONLY,
  handler: async ({ stage, limit, agent_email }, ctx) => {
    const gate = await requireAdmin(ctx);
    if (!gate.ok) return gate.result;
    const { supabase } = gate;
    let q = supabase
      .from("deals")
      .select(
        "id, user_id, client_name, property_address, stage, deal_value, commission_rate, company_split_percentage, source, expected_close_date, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 500);
    if (stage) q = q.eq("stage", stage as never);
    if (agent_email) {
      const id = await resolveAgentId(supabase, agent_email);
      if (!id) return notFound(agent_email);
      q = q.eq("user_id", id);
    }
    const [{ data, error }, dir] = await Promise.all([q, loadAgentDirectory(supabase)]);
    if (error) return errorResult(error.message);
    const deals = enrich(data, dir, "user_id");
    return okResult({ count: deals.length, stage: stage ?? "all", deals });
  },
});
