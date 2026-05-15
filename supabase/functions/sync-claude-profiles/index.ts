import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const agentId = body?.record?.id ?? body?.agent_id ?? null;

    const query = supabase.from("agents").select("*");
    const { data: agents, error: agentsErr } = agentId
      ? await query.eq("id", agentId)
      : await query;

    if (agentsErr) throw agentsErr;

    let synced = 0;
    const errors: Array<{ agent_id: string; error: string }> = [];

    for (const agent of agents ?? []) {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system:
              "You are a team assistant for a real estate company. Generate professional profiles and project plans for agents. Always respond with valid JSON only, no extra text.",
            messages: [
              {
                role: "user",
                content: `Agent data: ${JSON.stringify(agent)}

Return a JSON object with:
- "bio": 2-3 sentence professional summary
- "goals": array of 3 goals based on their role and FUB activity
- "tasks": array of 5 prioritized tasks for this week
- "assistant_intro": personalized greeting shown when they log in`,
              },
            ],
          }),
        });

        if (!response.ok) {
          const t = await response.text();
          throw new Error(`Anthropic ${response.status}: ${t.slice(0, 300)}`);
        }

        const result = await response.json();
        const text: string = result?.content?.[0]?.text ?? "";
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const aiData = JSON.parse(cleaned);

        const { error: upsertErr } = await supabase
          .from("agent_claude_profiles")
          .upsert(
            {
              agent_id: agent.id,
              bio: aiData.bio,
              goals: aiData.goals,
              tasks: aiData.tasks,
              assistant_intro: aiData.assistant_intro,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "agent_id" }
          );

        if (upsertErr) throw upsertErr;
        synced++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed to sync agent ${agent.id}:`, msg);
        errors.push({ agent_id: agent.id, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ synced, total: agents?.length ?? 0, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("sync-claude-profiles error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});