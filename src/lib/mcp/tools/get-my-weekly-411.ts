import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_weekly_411",
  title: "Get my weekly 4-1-1",
  description:
    "Return the signed-in agent's recent weekly 4-1-1 accountability entries: goals vs actuals, activity counts and weekly priorities.",
  inputSchema: {
    weeks: z.number().int().min(1).max(26).default(4).describe("How many recent weeks to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ weeks }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("weekly_411")
      .select(
        "week_start_date, calls_goal, calls_actual, appointments_goal, appointments_actual, listings_goal, listings_actual, contracts_goal, contracts_actual, contacts_made, dials, doors_knocked, appointments_set, appointments_held, contracts_signed, pipeline_additions, firm_deals, priority_1, priority_2, priority_3, priority_4, wins, challenges, next_steps",
      )
      .eq("user_id", ctx.getUserId())
      .order("week_start_date", { ascending: false })
      .limit(weeks ?? 4);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = { count: data?.length ?? 0, weeks: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
