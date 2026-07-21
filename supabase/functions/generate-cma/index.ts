import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BodySchema = z.object({
  report_id: z.string().uuid().nullish(),
  property: z.object({
    address: z.string().min(1),
    city_area: z.string().min(1),
    type: z.string().default("detached"),
    beds: z.number().nullable().optional(),
    baths: z.number().nullable().optional(),
    sqft: z.number().nullable().optional(),
    target_list_price: z.number().nullable().optional(),
    intended_list_date: z.string().nullable().optional(),
  }),
  purchase_history: z.object({
    purchase_price: z.number(),
    purchase_date: z.string(),
    improvements_invested: z.number().default(0),
    improvements_list: z.array(
      z.object({
        description: z.string(),
        amount: z.number(),
        date: z.string().optional(),
      })
    ).optional(),
  }),
  market_stats: z.object({
    active_listings: z.number().nullable().optional(),
    sold_listings: z.number().nullable().optional(),
    median_sale_price: z.number().nullable().optional(),
    avg_days_on_market: z.number().nullable().optional(),
    sale_to_list_ratio: z.number().nullable().optional(),
    months_of_inventory: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).optional(),
  comps: z.array(
    z.object({
      address: z.string(),
      area: z.string().optional(),
      beds: z.number().nullable().optional(),
      baths: z.number().nullable().optional(),
      sqft: z.number().nullable().optional(),
      list_price: z.number().nullable().optional(),
      sold_price: z.number().nullable().optional(),
      days_on_market: z.number().nullable().optional(),
      sale_date: z.string().nullable().optional(),
      comp_category: z.string().default("sold"),
      is_weak: z.boolean().default(false),
      weak_reason: z.string().nullable().optional(),
    })
  ).optional(),
  analysis: z.object({
    cma_grade: z.string().nullable().optional(),
    pricing_band_low: z.number().nullable().optional(),
    pricing_band_recommended: z.number().nullable().optional(),
    pricing_band_high: z.number().nullable().optional(),
    pricing_confidence: z.string().nullable().optional(),
    strategy_recommendation: z.string().nullable().optional(),
    risk_flags: z.array(z.string()).optional(),
    weak_comp_alerts: z.array(z.string()).optional(),
    adjustment_observations: z.array(z.string()).optional(),
    talking_points: z.array(z.string()).optional(),
    seller_objections: z.array(
      z.object({ objection: z.string(), response: z.string() })
    ).optional(),
    market_narrative: z.string().nullable().optional(),
  }).optional(),
});

const SYSTEM_PROMPT = `You are a senior real estate analyst at LUXE Realty Group preparing a Comparative Market Analysis (CMA) for a seller. Your job is to produce polished, client-ready narrative sections AND concise internal agent talking points from the provided property data, comparable sales, market statistics, and pricing analysis.

Write in a warm, confident, professional tone. Be specific with numbers and location names. Do not invent facts that aren't supported by the data. If a data point is missing, work around it rather than hallucinating.

Output ONLY a single JSON object (no markdown, no code fences) with this exact structure:

{
  "executive_summary": "string — 2-3 paragraphs for the client cover page. Introduce the property, the recommended listing price, the price band, and the confidence level. Mention key market context briefly.",
  "price_narrative": "string — 1-2 paragraphs explaining how the pricing band was derived from the comps and why the recommended price is positioned well.",
  "market_conditions": "string — 1-2 paragraphs describing current market conditions in the area using the provided stats (median sale price, days on market, sale-to-list ratio, months of inventory, active vs sold listings).",
  "strategy_recommendation": "string — a concise strategic recommendation such as 'Price at the recommended list price with a launch timeline of X days' plus 1-2 sentences of rationale.",
  "talking_points": ["string", ...], // 5-7 client-facing bullets for the listing presentation
  "seller_objections": [
    { "objection": "string", "response": "string" }
  ], // 4-5 common seller objections and polished responses
  "risk_flags": ["string", ...], // 3-5 honest risks or caveats for the agent to be aware of
  "weak_comp_alerts": ["string", ...] // 3-5 alerts about any weak comparables and why they were still considered or discounted
}

Rules:
- Use ONLY the numbers provided in the data. Do not estimate or assume.
- Reference the specific area/city when discussing market conditions.
- If the CMA grade is low, be honest but tactful about data limitations.
- If there are fewer than 3 sold comps, note that the pricing confidence should be treated more cautiously.
- Keep client-facing text persuasive and clear; keep internal talking points and risks concise and actionable.`;

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "N/A";
  return `$${n.toLocaleString("en-CA")}`;
}

function buildPrompt(data: z.infer<typeof BodySchema>): string {
  const p = data.property;
  const ph = data.purchase_history;
  const m = data.market_stats;
  const a = data.analysis;
  const comps = data.comps ?? [];

  const strongComps = comps.filter((c) => !c.is_weak);
  const soldComps = comps.filter((c) => c.comp_category === "sold" && c.sold_price);
  const activeComps = comps.filter((c) => c.comp_category === "active");

  const totalCost = ph.purchase_price + (ph.improvements_invested || 0);
  const lowProceeds = a?.pricing_band_low ? a.pricing_band_low - totalCost : null;
  const highProceeds = a?.pricing_band_high ? a.pricing_band_high - totalCost : null;

  return `Generate a complete CMA narrative for the following property and data.

SUBJECT PROPERTY
- Address: ${p.address}
- Area/City: ${p.city_area}
- Type: ${p.type}
- Beds: ${p.beds ?? "N/A"}
- Baths: ${p.baths ?? "N/A"}
- Approx. Sqft: ${p.sqft ?? "N/A"}
- Target List Price (if agent provided): ${formatCurrency(p.target_list_price)}
- Intended List Date: ${p.intended_list_date ?? "N/A"}

PURCHASE HISTORY / EQUITY
- Purchase Price: ${formatCurrency(ph.purchase_price)}
- Purchase Date: ${ph.purchase_date}
- Improvements Invested: ${formatCurrency(ph.improvements_invested)}
- Total Cost Basis: ${formatCurrency(totalCost)}
- Estimated Net Proceeds Range (low): ${formatCurrency(lowProceeds)}
- Estimated Net Proceeds Range (high): ${formatCurrency(highProceeds)}
${ph.improvements_list && ph.improvements_list.length > 0
  ? `- Improvement Details:\n${ph.improvements_list.map((i) => `  • ${i.description}: ${formatCurrency(i.amount)}`).join("\n")}`
  : ""}

MARKET STATISTICS
- Active Listings: ${m?.active_listings ?? "N/A"}
- Sold Listings: ${m?.sold_listings ?? "N/A"}
- Median Sale Price: ${formatCurrency(m?.median_sale_price)}
- Average Days on Market: ${m?.avg_days_on_market ?? "N/A"}
- Sale-to-List Ratio: ${m?.sale_to_list_ratio ? `${m.sale_to_list_ratio}%` : "N/A"}
- Months of Inventory: ${m?.months_of_inventory ?? "N/A"}
${m?.notes ? `- Agent Notes: ${m.notes}` : ""}

PRICING ANALYSIS
- CMA Grade: ${a?.cma_grade ?? "N/A"}
- Pricing Band Low: ${formatCurrency(a?.pricing_band_low)}
- Pricing Band Recommended: ${formatCurrency(a?.pricing_band_recommended)}
- Pricing Band High: ${formatCurrency(a?.pricing_band_high)}
- Pricing Confidence: ${a?.pricing_confidence ?? "N/A"}
- Strategy Recommendation (from analyzer): ${a?.strategy_recommendation ?? "N/A"}

COMPARABLE PROPERTIES
- Total Comps: ${comps.length}
- Strong Comps: ${strongComps.length}
- Sold Comps: ${soldComps.length}
- Active/Expired Comps: ${activeComps.length}

${comps.length > 0 ? "Comp Details:\n" + comps.map((c, i) =>
  `  ${i + 1}. ${c.address}${c.area ? `, ${c.area}` : ""} — ${c.comp_category} | ${c.beds ?? "?"} bed / ${c.baths ?? "?"} bath | ${c.sqft ?? "?"} sqft | ${c.sold_price ? `Sold ${formatCurrency(c.sold_price)}` : c.list_price ? `List ${formatCurrency(c.list_price)}` : "Price N/A"} | DOM ${c.days_on_market ?? "N/A"}${c.is_weak ? ` | WEAK: ${c.weak_reason || ""}` : ""}`
).join("\n") : "No comparable properties provided."}

${a?.risk_flags && a.risk_flags.length > 0 ? `RISK FLAGS FROM ANALYZER:\n${a.risk_flags.map((r) => `• ${r}`).join("\n")}` : ""}

${a?.weak_comp_alerts && a.weak_comp_alerts.length > 0 ? `WEAK COMP ALERTS FROM ANALYZER:\n${a.weak_comp_alerts.map((r) => `• ${r}`).join("\n")}` : ""}

${a?.adjustment_observations && a.adjustment_observations.length > 0 ? `ADJUSTMENT OBSERVATIONS FROM ANALYZER:\n${a.adjustment_observations.map((r) => `• ${r}`).join("\n")}` : ""}

${a?.market_narrative ? `EXISTING MARKET NARRATIVE (you may rewrite more concisely):\n${a.market_narrative}` : ""}

Generate the JSON output now.`;
}

function safeJsonParse(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request body", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = parsed.data;
    console.log("generate-cma: request received", { report_id: data.report_id, property: data.property.address });

    const prompt = buildPrompt(data);

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    console.log("generate-cma: anthropic response status", aiRes.status);

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, t);
      throw new Error(`Anthropic API error ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const generatedText: string = aiJson?.content?.[0]?.text ?? "";
    const generated = safeJsonParse(generatedText);

    if (!generated || typeof generated !== "object") {
      throw new Error("Claude returned unparseable JSON");
    }

    const result = {
      executive_summary: (generated as any).executive_summary ?? "",
      price_narrative: (generated as any).price_narrative ?? "",
      market_conditions: (generated as any).market_conditions ?? "",
      strategy_recommendation: (generated as any).strategy_recommendation ?? "",
      talking_points: Array.isArray((generated as any).talking_points) ? (generated as any).talking_points : [],
      seller_objections: Array.isArray((generated as any).seller_objections) ? (generated as any).seller_objections : [],
      risk_flags: Array.isArray((generated as any).risk_flags) ? (generated as any).risk_flags : [],
      weak_comp_alerts: Array.isArray((generated as any).weak_comp_alerts) ? (generated as any).weak_comp_alerts : [],
    };

    // If report_id is provided, optionally save the generated narratives to cma_reports
    if (data.report_id) {
      console.log("generate-cma: saving to report", data.report_id);
      const { error: upsertErr } = await supabase
        .from("cma_reports")
        .update({
          market_narrative: result.market_conditions,
          talking_points: result.talking_points,
          seller_objections: result.seller_objections,
          risk_flags: result.risk_flags,
          weak_comp_alerts: result.weak_comp_alerts,
          strategy_recommendation: result.strategy_recommendation,
          // Only populate approved fields if they are currently empty
          approved_executive_summary: result.executive_summary,
          approved_price_narrative: result.price_narrative,
          approved_strategy: result.strategy_recommendation,
          approved_market_conditions: result.market_conditions,
          approved_talking_points: result.talking_points.join("\n"),
          approved_risk_flags: result.risk_flags.join("\n"),
          approved_objections: result.seller_objections
            .map((o: any) => `Q: ${o.objection}\nA: ${o.response}`)
            .join("\n\n"),
        })
        .eq("id", data.report_id);

      if (upsertErr) {
        console.error("Failed to save generated CMA text to cma_reports:", upsertErr);
      }
    }

    console.log("generate-cma: returning success");
    return new Response(JSON.stringify({ success: true, generated: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cma error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
