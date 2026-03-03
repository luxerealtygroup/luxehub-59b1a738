import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { pdfText, subjectProperty, purchaseHistory, marketStats } = await req.json();

    const systemPrompt = `You are a real estate CMA (Comparative Market Analysis) expert analyst. You will analyze CMA data and provide a comprehensive audit.

You MUST respond with a JSON object using this exact structure (no markdown, no code blocks, just pure JSON):
{
  "extracted_comps": [
    {
      "address": "string",
      "area": "string",
      "beds": number or null,
      "baths": number or null,
      "list_price": number or null,
      "sold_price": number or null,
      "days_on_market": number or null,
      "sale_date": "string or null",
      "is_weak": boolean,
      "weak_reason": "string or null"
    }
  ],
  "cma_grade": "A|B|C|D|F",
  "pricing_band_low": number,
  "pricing_band_recommended": number,
  "pricing_band_high": number,
  "pricing_confidence": "High|Medium|Low",
  "risk_flags": ["string"],
  "weak_comp_alerts": ["string"],
  "adjustment_observations": ["string"],
  "talking_points": ["string"],
  "seller_objections": [
    { "objection": "string", "response": "string" }
  ],
  "strategy_recommendation": "Conservative|Market|Aggressive",
  "market_narrative": "string"
}

When analyzing:
1. Extract all comparable properties from the CMA PDF text
2. Flag weak comps (distance issues, outdated sales >6 months, size/type mismatch, price outliers >15% from median)
3. Grade the CMA quality (A=excellent comps, tight range; F=poor comps, wide gaps)
4. Generate a pricing band based on comp analysis
5. Analyze market stats to determine market conditions (buyer's/seller's/balanced)
6. Generate a market narrative incorporating the stats
7. Calculate strategy recommendation based on market conditions and comp quality
8. Generate talking points and anticipate seller objections with responses`;

    const userPrompt = `Analyze this CMA data:

SUBJECT PROPERTY:
${JSON.stringify(subjectProperty, null, 2)}

CLIENT PURCHASE HISTORY:
${JSON.stringify(purchaseHistory, null, 2)}

MARKET STATS:
${JSON.stringify(marketStats, null, 2)}

CMA PDF CONTENT:
${pdfText || "No PDF text extracted - analyze based on available data only."}

Provide your complete analysis as a JSON object.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown code blocks if present)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis", raw: content }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, analysis: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("CMA analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
