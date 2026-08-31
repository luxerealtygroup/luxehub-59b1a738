import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_pipeline_client",
  title: "Add pipeline client",
  description: "Add a new client to the signed-in agent's LUXEhub pipeline.",
  inputSchema: {
    client_name: z.string().trim().min(1).describe("Full name of the client."),
    client_type: z.string().trim().optional().describe("Buyer, Seller, Tenant, etc."),
    deal_category: z.string().trim().optional().describe("Deal category, e.g. Sale or Lease."),
    property_address: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().optional(),
    source: z.string().trim().optional().describe("Source of business."),
    projected_sale_amount: z.number().nonnegative().optional(),
    projected_gci: z.number().nonnegative().optional(),
    expected_pending_date: z.string().trim().optional().describe("ISO date (YYYY-MM-DD)."),
    notes: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("pipeline_clients")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Added ${input.client_name} to the pipeline.` }],
      structuredContent: { client: data },
    };
  },
});
