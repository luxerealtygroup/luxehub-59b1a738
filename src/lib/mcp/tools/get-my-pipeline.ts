import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_pipeline",
  title: "Get my pipeline",
  description:
    "List the signed-in agent's pipeline clients, with stage, deal category, projected sale amount and projected GCI.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of pipeline clients to return."),
    status: z.string().trim().optional().describe("Optional status filter, e.g. 'active'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("pipeline_clients")
      .select(
        "id, client_name, client_type, deal_category, stage, status, source, property_address, projected_sale_amount, projected_gci, expected_pending_date, created_at",
      )
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify({ count: data?.length ?? 0, clients: data ?? [] }, null, 2) }],
      structuredContent: { count: data?.length ?? 0, clients: data ?? [] },
    };
  },
});
