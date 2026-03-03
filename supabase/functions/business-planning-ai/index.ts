import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics, quarter } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const m = metrics;
    const prompt = `You are a real estate performance analyst. Based on these YTD metrics for an agent, generate Q${quarter} targets and tactical insights.

METRICS:
- YTD Closed Deals: ${m.ytdClosedDeals}
- YTD GCI: $${m.ytdGCI}
- Pending GCI: $${m.pendingGCI}
- Avg Commission: $${m.avgCommission}
- CMA → Listing: ${m.cmaToListingPct}%
- Appt → Contract: ${m.apptToContractPct}%
- Contact → Appt: ${m.contactToApptPct}%
- Dials → Appt: ${m.dialsToApptPct}%
- Weekly Avg Dials: ${m.weeklyAvgDials}
- Weekly Avg Contacts: ${m.weeklyAvgContacts}
- Weekly Avg Appts: ${m.weeklyAvgAppts}
- Weekly Avg CMAs: ${m.weeklyAvgCMAs}
- Pending Deals: ${m.pendingDeals}
- Active Listings: ${m.activeListings}
- Annual Target GCI: $${m.targetGCI}
- Projected Year-End GCI: $${m.projectedYearEndGCI}

Quarter has 13 weeks.

Rules:
- All numbers must be whole integers, no decimals
- Be direct, assertive, performance-driven
- No soft language
- Identify bottlenecks clearly`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Generate the three Q targets and tactical insights." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_planning_data",
              description: "Return 3 Q target suggestions and 4-6 tactical insights",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", enum: ["Conservative", "Realistic", "Aggressive"] },
                        closings: { type: "integer" },
                        gci: { type: "integer" },
                        weeklyDials: { type: "integer" },
                        weeklyContacts: { type: "integer" },
                        weeklyAppts: { type: "integer" },
                        weeklyCMAs: { type: "integer" },
                      },
                      required: ["label", "closings", "gci", "weeklyDials", "weeklyContacts", "weeklyAppts", "weeklyCMAs"],
                    },
                  },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        type: { type: "string", enum: ["warning", "info", "action"] },
                      },
                      required: ["text", "type"],
                    },
                  },
                },
                required: ["suggestions", "insights"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_planning_data" } },
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
    console.error("business-planning-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
