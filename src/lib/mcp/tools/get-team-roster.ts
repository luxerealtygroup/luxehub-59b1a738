import { defineTool } from "@lovable.dev/mcp-js";
import { requireAdmin, errorResult, okResult, READ_ONLY } from "../admin";

export default defineTool({
  name: "get_team_roster",
  title: "Get team roster (admin)",
  description:
    "Owners/admins only, read-only: returns every agent profile and role in the signed-in user's brokerage.",
  inputSchema: {},
  annotations: READ_ONLY,
  handler: async (_args, ctx) => {
    const gate = await requireAdmin(ctx);
    if (!gate.ok) return gate.result;
    const { supabase } = gate;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, member_type, display_title, include_in_team_coaching")
      .order("full_name");
    if (error) return errorResult(error.message);
    const { data: roles, error: rErr } = await supabase.from("user_roles").select("user_id, role");
    if (rErr) return errorResult(rErr.message);
    const byUser = new Map<string, string[]>();
    for (const r of (roles ?? []) as { user_id: string; role: string }[]) {
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), String(r.role)]);
    }
    const agents = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      ...p,
      roles: byUser.get(String(p.id)) ?? [],
    }));
    return okResult({ count: agents.length, agents });
  },
});
