import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const actualsSchema = z
  .object({
    leads_received: z.number().int().min(0).optional(),
    dials: z.number().int().min(0).optional(),
    connects: z.number().int().min(0).optional(),
    conversations: z.number().int().min(0).optional(),
    texts_sent: z.number().int().min(0).optional(),
    appointments_set: z.number().int().min(0).optional(),
    talk_time_minutes: z.number().int().min(0).optional(),
    speed_to_first_touch_minutes: z.number().int().min(0).optional(),
    contacts_held: z.number().int().min(0).optional().describe("Total contacts assigned to the agent."),
    contacts_unstaged: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("How many of those contacts sit in the default Contact or Lead stages."),
    contacts_per_live_deal: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe("Contacts per live deal; omit or null when the agent has no live deal."),
  })
  .describe("Weekly activity and database-health actuals. Omitted fields keep their existing value.");

export default defineTool({
  name: "record_weekly_411_actuals",
  title: "Record weekly 4-1-1 actuals",
  description:
    "Record an agent's weekly 4-1-1 activity and database-health actuals from an external system (e.g. a Follow Up Boss weekly automation). Upserts on agent + week, so re-running a week overwrites instead of duplicating. Owners and admins only, and only for agents in their own brokerage.",
  inputSchema: {
    agent_email: z.string().trim().email().describe("Login email of the agent in your brokerage."),
    week_start: z.string().trim().describe("ISO date (YYYY-MM-DD) inside the week; normalised to that week's Monday."),
    actuals: actualsSchema,
    note: z.string().trim().max(2000).optional().describe("Short coaching line stored with the week."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ agent_email, week_start, actuals, note }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return {
        content: [{ type: "text", text: "week_start must be an ISO date in YYYY-MM-DD format." }],
        isError: true,
      };
    }

    const payload = Object.fromEntries(
      Object.entries(actuals ?? {}).filter(([, v]) => v !== undefined),
    ) as Record<string, number | null>;

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("record_weekly_411_actuals", {
      _agent_email: agent_email,
      _week_start: week_start,
      _actuals: payload,
      _note: note ?? null,
    });

    if (error) {
      const message = error.message.includes("AGENT_NOT_FOUND_IN_ORG")
        ? `No agent with the email ${agent_email} exists in your brokerage. Check that the Follow Up Boss email matches the agent's login email, then retry.`
        : error.message.includes("FORBIDDEN_ADMIN_ONLY")
          ? "Only owners and admins can record weekly 4-1-1 actuals."
          : error.message;
      return { content: [{ type: "text", text: message }], isError: true };
    }

    const result = (data ?? {}) as { week_start_date?: string; action?: string };
    const written = Object.keys(payload);
    const summary = `${result.action === "updated" ? "Updated" : "Created"} the week of ${
      result.week_start_date ?? week_start
    } for ${agent_email}${written.length ? ` (${written.join(", ")})` : ""}.`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { agent_email, ...result, fields_written: written },
    };
  },
});
