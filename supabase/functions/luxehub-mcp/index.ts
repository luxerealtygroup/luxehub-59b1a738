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
      "Return all pipeline clients for a LuxeHub user. Requires the user's email address to identify them.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The LuxeHub user's email address (used to look up their account).",
        },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },
  {
    name: "get_my_deals",
    description:
      "Return deals for a LuxeHub user. Requires the user's email address. Optionally filter by stage.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The LuxeHub user's email address (used to look up their account).",
        },
        stage: {
          type: "string",
          enum: ["active", "under_contract", "closed", "all"],
          description: "Optional stage filter. Defaults to 'all'.",
        },
      },
      required: ["email"],
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

      // Identify user by email (no JWT — Claude.ai passes its own bearer token)
      const emailRaw = (args as { email?: string }).email;
      if (!emailRaw || typeof emailRaw !== "string") {
        return rpcError(id, -32602, "Missing required parameter: email");
      }
      const email = emailRaw.trim().toLowerCase();

      // Use service-role client to look up the auth user by email
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: userLookup, error: lookupErr } =
        await (supabase.auth.admin as unknown as {
          getUserByEmail: (e: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
        }).getUserByEmail?.(email).catch(() => ({ data: { user: null }, error: null })) ??
        { data: { user: null }, error: null };

      let userId: string | null = userLookup?.user?.id ?? null;

      // Fallback: page through auth users (small team) if getUserByEmail isn't available
      if (!userId) {
        let page = 1;
        while (page <= 5 && !userId) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
          if (error) break;
          const match = data?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
          if (match) { userId = match.id; break; }
          if (!data?.users?.length || data.users.length < 200) break;
          page++;
        }
      }

      if (!userId) {
        return rpcError(id, -32004, `No LuxeHub user found for email '${email}'.`);
      }

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