import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  requireAdmin, loadAgentDirectory, resolveAgentId, enrich, errorResult, notFound, okResult, READ_ONLY,
} from "../admin";

export default defineTool({
  name: "get_team_pipeline",
  title: "Get team pipeline (admin)",
  description:
    "Owners/admins only, read-only: returns pipeline clients for every agent in the signed-in user's brokerage.",
  inputSchema: {
    limit: z.number().int().min(1).max(1000).default(500).describe("Maximum rows."),
    status: z.string().trim().optional().describe("Optional status filter."),
    agent_email: z.string().trim().email().optional().describe("Optional: limit to one agent by email."),
  },
  annotations: READ_ONLY,
  handler: async ({ limit, status, agent_email }, ctx) => {
    const gate = await requireAdmin(ctx);
    if (!gate.ok) return gate.result;
    const { supabase } = gate;
    let q = supabase
      .from("pipeline_clients")
      .select(
        "id, user_id, client_name, client_type, deal_category, stage, status, source, property_address, projected_sale_amount, projected_gci, expected_pending_date, fub_deal_stage, fub_deal_price, fub_deal_close_date, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 500);
    if (status) q = q.eq("status", status);
    if (agent_email) {
      const id = await resolveAgentId(supabase, agent_email);
      if (!id) return notFound(agent_email);
      q = q.eq("user_id", id);
    }
    const [{ data, error }, dir] = await Promise.all([q, loadAgentDirectory(supabase)]);
    if (error) return errorResult(error.message);
    const clients = enrich(data, dir, "user_id");
    return okResult({ count: clients.length, status: status ?? "all", clients });
  },
});
