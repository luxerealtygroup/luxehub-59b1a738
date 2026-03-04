import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { paceData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const d = paceData;
    const prompt = `You are a direct, no-nonsense real estate performance coach. Analyze this agent's data and recommend the SINGLE most impactful lever to pull THIS WEEK.

AGENT DATA:
- YTD Closed Deals: ${d.ytdClosedDeals}
- YTD GCI: $${d.ytdGciGross}
- Pending Deals: ${d.pendingDeals}
- Pipeline Deficit: ${d.pipelineDeficit} deals
- Current Pipeline: ${d.currentPipelineCount} clients
- Q2 Closings Goal: ${d.q2ClosingsGoal}
- Projected Q2 Closings: ${d.projectedQ2Deals}
- Q2 Deal Gap: ${d.gapDealsQ2}
- Annual Deals Goal: ${d.annualDealsGoal}
- Projected Year-End Deals: ${d.projectedYearDeals}
- Year Deal Gap: ${d.gapDealsYear}

CONVERSION RATES:
- Contact → Appt: ${d.contactToApptRate}%
- Dial → Appt: ${d.dialToApptRate}%
- Appt → Contract: ${d.apptToContractRate}%

RECENT WEEKLY AVERAGES:
- Dials/week: ${d.weeklyAvgDials}
- Contacts/week: ${d.weeklyAvgContacts}
- Appts/week: ${d.weeklyAvgAppts}

Determine whether the biggest opportunity is:
1. ACTIVITY VOLUME (more dials/contacts)
2. CONVERSION IMPROVEMENT (better appt or contract rates)
3. PIPELINE QUALITY (better lead sources, faster follow-up)

Be specific, practical, and measurable. All target numbers must be whole integers.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Coach me. What's my #1 lever and what should I do this week?" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_coaching",
              description: "Return the #1 lever, 3 actions, and suggested weekly targets",
              parameters: {
                type: "object",
                properties: {
                  lever: {
                    type: "string",
                    description: "The single most impactful lever to focus on this week (1-2 sentences)",
                  },
                  actions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exactly 3 specific, practical, measurable actions",
                  },
                  targets: {
                    type: "object",
                    properties: {
                      dials: { type: "integer" },
                      contacts: { type: "integer" },
                      appts: { type: "integer" },
                      pipeline: { type: "integer" },
                    },
                    required: ["dials", "contacts", "appts", "pipeline"],
                  },
                },
                required: ["lever", "actions", "targets"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_coaching" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-me error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
