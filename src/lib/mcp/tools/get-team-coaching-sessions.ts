import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  requireAdmin, loadAgentDirectory, resolveAgentId, enrich, errorResult, notFound, okResult, READ_ONLY, DATE_RE,
} from "../admin";

export default defineTool({
  name: "get_team_coaching_sessions",
  title: "Get team coaching sessions (admin)",
  description:
    "Owners/admins only, read-only: returns coaching sessions for every agent in the signed-in user's brokerage.",
  inputSchema: {
    week_from: z.string().trim().regex(DATE_RE, "Use YYYY-MM-DD").optional().describe("Earliest week_of (YYYY-MM-DD)."),
    agent_email: z.string().trim().email().optional().describe("Optional: limit to one agent by email."),
    include_transcript: z.boolean().default(false).describe("Include full transcript text."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum rows."),
  },
  annotations: READ_ONLY,
  handler: async ({ week_from, agent_email, include_transcript, limit }, ctx) => {
    const gate = await requireAdmin(ctx);
    if (!gate.ok) return gate.result;
    const { supabase } = gate;
    const cols = "id, agent_id, week_of, generated_notes, created_by, created_at" + (include_transcript ? ", transcript_text" : "");
    let q = supabase.from("coaching_sessions").select(cols).order("week_of", { ascending: false }).limit(limit ?? 50);
    if (week_from) q = q.gte("week_of", week_from);
    if (agent_email) {
      const id = await resolveAgentId(supabase, agent_email);
      if (!id) return notFound(agent_email);
      q = q.eq("agent_id", id);
    }
    const [{ data, error }, dir] = await Promise.all([q, loadAgentDirectory(supabase)]);
    if (error) return errorResult(error.message);
    const sessions = enrich(data as unknown[] | null, dir, "agent_id");
    return okResult({ count: sessions.length, sessions });
  },
});
