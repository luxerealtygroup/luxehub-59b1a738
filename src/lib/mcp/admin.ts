import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

type Client = ReturnType<typeof supabaseForUser>;
type ErrorResult = { content: { type: "text"; text: string }[]; isError: true };

export const errorResult = (text: string): ErrorResult => ({ content: [{ type: "text", text }], isError: true });

export async function requireAdmin(
  ctx: ToolContext,
): Promise<{ ok: true; supabase: Client; orgId: string } | { ok: false; result: ErrorResult }> {
  if (!ctx.isAuthenticated()) return { ok: false, result: errorResult("Not authenticated") };
  const supabase = supabaseForUser(ctx);
  const { data, error } = await supabase.rpc("is_admin_or_owner", { _user_id: ctx.getUserId() });
  if (error || data !== true) {
    return { ok: false, result: errorResult("Only owners and admins can use team-wide LUXEhub tools.") };
  }
  const { data: orgId, error: orgErr } = await supabase.rpc("current_user_org_id");
  if (orgErr || !orgId) return { ok: false, result: errorResult("Could not determine your brokerage.") };
  return { ok: true, supabase, orgId: String(orgId) };
}

export type AgentInfo = { full_name: string | null; email: string | null };

export async function loadAgentDirectory(supabase: Client, orgId: string): Promise<Map<string, AgentInfo>> {
  const { data, error } = await supabase.from("profiles").select("id, full_name, email, org_id").eq("org_id", orgId);
  const map = new Map<string, AgentInfo>();
  if (error || !data) return map;
  for (const p of data as { id: string; full_name: string | null; email: string | null }[]) {
    map.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null });
  }
  return map;
}

export async function resolveAgentId(supabase: Client, orgId: string, agent_email: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").eq("org_id", orgId).ilike("email", agent_email.trim()).limit(1);
  return (data as { id: string }[] | null)?.[0]?.id ?? null;
}

/** Adds agent_name/agent_email to each row, keyed by the given id column. */
export function enrich(rows: unknown[] | null, dir: Map<string, AgentInfo>, key: string) {
  return (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const info = dir.get(String(row[key] ?? ""));
    return { ...row, agent_name: info?.full_name ?? null, agent_email: info?.email ?? null };
  });
}

export const notFound = (email: string) =>
  errorResult(`No agent with the email ${email} exists in your brokerage.`);

export function okResult<T extends Record<string, unknown>>(payload: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: JSON.parse(JSON.stringify(payload)) as Record<string, never>,
  };
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
