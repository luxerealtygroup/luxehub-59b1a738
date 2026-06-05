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

const SERVER_INFO = { name: "luxehub-mcp", version: "1.0.0" };

const TOOLS = [
  {
    name: "get_my_pipeline",
    description:
      "Return all pipeline clients for the authenticated LuxeHub user from the pipeline_clients table.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_my_deals",
    description:
      "Return deals for the authenticated LuxeHub user from the deals table. Optionally filter by stage.",
    inputSchema: {
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
];

const rpcResult = (id: unknown, result: unknown) =>
  json({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Simple GET for health/discovery hints
  if (req.method === "GET") {
    return json({
      server: SERVER_INFO,
      protocol: "Model Context Protocol (JSON-RPC 2.0)",
      transport: "POST JSON-RPC to this URL",
      tools: TOOLS.map((t) => t.name),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Parse JSON-RPC body
  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error: invalid JSON");
  }

  const { id = null, method, params = {} } = rpc;
  if (!method) return rpcError(id, -32600, "Invalid Request: missing method");

  try {
    // No-auth methods: initialize, tools/list, notifications/*, ping
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
      // Notifications have no response per JSON-RPC, but return 200 empty for HTTP.
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method === "ping") {
      return rpcResult(id, {});
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const toolName = (params as { name?: string }).name;
      const args = ((params as { arguments?: Record<string, unknown> }).arguments) ?? {};
      if (!toolName) return rpcError(id, -32602, "Invalid params: missing tool name");

      // Authenticate via Supabase JWT
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return rpcError(id, -32001, "Unauthorized: missing Bearer token");
      }
      const token = authHeader.replace("Bearer ", "");

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return rpcError(id, -32001, "Unauthorized: invalid token");
      }
      const userId = claimsData.claims.sub as string;

      const toText = (payload: unknown) => ({
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      });

      if (toolName === "get_my_pipeline") {
        const { data, error } = await supabase
          .from("pipeline_clients")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return rpcResult(id, toText({
          summary: `Found ${data?.length ?? 0} pipeline client${data?.length === 1 ? "" : "s"} for the current user.`,
          count: data?.length ?? 0,
          results: data ?? [],
        }));
      }

      if (toolName === "get_my_deals") {
        const stageRaw = (args as { stage?: string }).stage ?? "all";
        const stage = String(stageRaw).toLowerCase();
        const allowed = ["active", "under_contract", "closed", "all"];
        if (!allowed.includes(stage)) {
          return rpcError(id, -32602, `Invalid stage '${stage}'. Allowed: ${allowed.join(", ")}`);
        }

        let query = supabase.from("deals").select("*").eq("user_id", userId);
        if (stage !== "all") query = query.eq("stage", stage);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;

        return rpcResult(id, toText({
          summary: `Found ${data?.length ?? 0} deal${data?.length === 1 ? "" : "s"}${stage !== "all" ? ` in stage '${stage}'` : ""} for the current user.`,
          count: data?.length ?? 0,
          stage,
          results: data ?? [],
        }));
      }

      return rpcError(id, -32601, `Unknown tool '${toolName}'`);
    }

    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("luxehub-mcp error:", msg);
    return rpcError(id, -32603, msg);
  }
});