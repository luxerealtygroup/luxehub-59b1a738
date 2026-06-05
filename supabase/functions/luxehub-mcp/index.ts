import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MANIFEST = {
  name: "luxehub-mcp",
  version: "1.0.0",
  description: "LuxeHub remote MCP server — exposes the logged-in agent's pipeline and deals.",
  tools: [
    {
      name: "get_my_pipeline",
      description:
        "Return all pipeline clients for the authenticated LuxeHub user from the pipeline_clients table.",
      input_schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "get_my_deals",
      description:
        "Return deals for the authenticated LuxeHub user from the deals table. Optionally filter by stage.",
      input_schema: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: ["active", "under_contract", "closed", "all"],
            description: "Optional stage filter. Defaults to 'all'.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  // Tool manifest discovery
  if (req.method === "GET") {
    if (path.endsWith("/mcp") || path.endsWith("/luxehub-mcp") || path === "" || path === "/") {
      return json(MANIFEST);
    }
    return json({ error: "Not found" }, 404);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Authenticate via Supabase JWT
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized: missing Bearer token" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "Unauthorized: invalid token" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  let body: { tool?: string; name?: string; input?: Record<string, unknown>; arguments?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const toolName = body.tool ?? body.name;
  const input = body.input ?? body.arguments ?? {};

  if (!toolName) {
    return json({ error: "Missing 'tool' (or 'name') in request body" }, 400);
  }

  try {
    if (toolName === "get_my_pipeline") {
      const { data, error } = await supabase
        .from("pipeline_clients")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return json({
        tool: toolName,
        summary: `Found ${data?.length ?? 0} pipeline client${data?.length === 1 ? "" : "s"} for the current user.`,
        count: data?.length ?? 0,
        results: data ?? [],
      });
    }

    if (toolName === "get_my_deals") {
      const stageRaw = (input as { stage?: string }).stage ?? "all";
      const stage = String(stageRaw).toLowerCase();
      const allowed = ["active", "under_contract", "closed", "all"];
      if (!allowed.includes(stage)) {
        return json({ error: `Invalid stage '${stage}'. Allowed: ${allowed.join(", ")}` }, 400);
      }

      let query = supabase.from("deals").select("*").eq("user_id", userId);
      if (stage !== "all") query = query.eq("stage", stage);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      return json({
        tool: toolName,
        summary: `Found ${data?.length ?? 0} deal${data?.length === 1 ? "" : "s"}${stage !== "all" ? ` in stage '${stage}'` : ""} for the current user.`,
        count: data?.length ?? 0,
        stage,
        results: data ?? [],
      });
    }

    return json({ error: `Unknown tool '${toolName}'` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("luxehub-mcp error:", msg);
    return json({ error: msg }, 500);
  }
});