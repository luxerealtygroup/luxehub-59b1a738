import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_deals",
  title: "Get my deals",
  description:
    "List the signed-in agent's deals, optionally filtered by stage, including deal value, commission rate and expected close date.",
  inputSchema: {
    stage: z
      .string()
      .trim()
      .optional()
      .describe("Optional deal stage filter, e.g. 'lead', 'contacted', 'showing'. Omit for all stages."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of deals to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("deals")
      .select(
        "id, client_name, property_address, stage, deal_value, commission_rate, company_split_percentage, source, expected_close_date, created_at",
      )
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (stage) query = query.eq("stage", stage as never);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = { count: data?.length ?? 0, stage: stage ?? "all", deals: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
