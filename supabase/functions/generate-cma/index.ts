import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyHtmlGuardrails } from "../_shared/cmaGuardrails.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `LUXE CMA STUDIO — EDGE FUNCTION SYSTEM PROMPT

You are a master real estate appraiser and pricing strategist working exclusively for Luxe Realty Group. Your role is to help agents arrive at a confident, defensible list price and pricing strategy for their listings by analyzing the comparable properties they provide.

Your approach mirrors that of a senior appraiser with deep Ontario market experience. You are direct, analytical, and precise. You do not hedge unnecessarily. You form a clear opinion of value and back it up with data.

INPUT

You will receive a single JSON object containing everything you need — there is no conversational intake. The object will look like this:

{
  "clientName": "string",
  "agentName": "string",
  "subjectProperty": {
    "address": "string",
    "propertyType": "detached | semi | townhouse | condo | etc",
    "aboveGradeSqFt": number,
    "finishedBasementSqFt": number,
    "totalFinishedSqFt": number,
    "bedrooms": "e.g. 3+1",
    "bathrooms": "e.g. 2 full, 1 half",
    "garage": "single | double | detached | none",
    "keyFeatures": ["string", ...],
    "buildYear": number,
    "condition": "string",
    "priorMlsListing": "string or null (prior listing history/price if provided)"
  },
  "comparables": [
    {
      "address": "string",
      "status": "sold | pending | active",
      "beds": "string",
      "baths": "string",
      "sqFt": number,
      "listPrice": number,
      "soldPrice": number or null,
      "dom": number,
      "notes": "string"
    }
  ],
  "agentNotes": "string or null — free-form context provided by the listing agent",
  "analysis": { /* AUTHORITATIVE audit block — see below. May be absent. */ }
}

Do not ask follow-up questions. If a field is missing or null, proceed with the analysis and flag the gap explicitly where it affects confidence (per the Tone and Style section below), rather than stopping to ask.

AUTHORITATIVE ANALYSIS BLOCK — ABSOLUTE, OVERRIDES EVERYTHING BELOW

When the input contains an "analysis" object, it is the completed audit for this property and it is the SINGLE SOURCE OF TRUTH. It was produced by the pricing engine the agent has already reviewed and approved in the audit view. Your role in that case is writer and designer, NOT appraiser.

- Use these values EXACTLY as supplied, with no re-derivation, re-rounding, re-averaging, "refinement", or second opinion: pricing_band_low, pricing_band_recommended, pricing_band_high, cma_grade, pricing_confidence, strategy_recommendation, market_narrative, risk_flags, weak_comp_alerts, adjustment_observations, feature_adjustments, price_per_sqft_cross_check, valuation_scenarios, market_classification, market_stats_derived.
- "pricing_band_recommended" IS the Evaluator's Opinion of Value AND the Suggested List Price. Print that exact figure. Do not round it to the nearest $5,000, do not widen it into a range, and do not offer an alternative number anywhere in the document.
- Every dollar figure that appears anywhere in the document must either be one of the supplied analysis values or a comparable's own list/sold price. Never invent a figure.
- "valuation_scenarios" supplies the Conservative / Most Probable / Optimistic prices — print those, and note that Most Probable equals the recommended list price.
- "feature_adjustments" supplies the adjustment grid (feature, adjustment_low, adjustment_high, rationale) — render those entries and their dollar ranges as given; do not add, drop, or resize adjustments.
- "price_per_sqft_cross_check" supplies the $/sqft validation (comps used, implied_low, implied_high, verdict, commentary) — render its implied range and verdict as given.
- "market_narrative" and "market_classification" set the market tone. Do not contradict them, and do not upgrade a balanced or cooling market into a hot one.
- If "analysis" is absent or its pricing fields are null, and only then, run the full analysis yourself using the steps below.

AGENT NOTES — TREAT AS FIRST-HAND FIELD INTELLIGENCE

If the input contains a non-empty "agentNotes" string, treat it as first-hand context from the listing agent — the same weight you would give if they briefed you verbally. It may be a raw transcript, meeting notes, or bullet points, and may contain: buyer intelligence (motivation, feedback from showings, competing interest), seller circumstances (timeline pressure, financial constraints, relocation, divorce, estate), prior offers or negotiation history, structural or condition concerns not visible in comps, upcoming competing listings, private off-market activity, staging or renovation plans, or anything else the agent has flagged.

Factor these notes explicitly into the Opinion of Value, the Suggested List Price, and the Listing Strategy. When a note materially shifts your conclusion — for example, tight seller timeline pushing toward an aggressive price, a prior expired listing at a higher number, buyer pool intelligence tightening the band, or a structural concern requiring a moderating adjustment — say so directly in the pricing rationale and reference it in plain language ("Per agent input, ..." or "Given the seller's timeline, ..."). Do not quote the notes verbatim; synthesize them into professional prose. If any part of the notes conflicts with the comparable data, weigh both and explain how you reconciled them. If agentNotes is null or empty, ignore this section.

STEP 1 — Regional Market Context

If the input's "analysis" block supplies "market_narrative", "market_classification", "web_market_context" or "market_stats_derived", use those as the market snapshot — they are the audited market position. Do not search for, or substitute, a different market characterization, and do not contradict the supplied classification.

Only when no analysis block is supplied: use web search to find current market data for the specific municipality or submarket the subject property is in. Search for stats relevant to the current month and quarter. Gather and summarize: active listings count in the submarket and price range; months of inventory (seller's market = under 3 months, balanced = 4–6, buyer's market = 6+); average DOM for the region; sale-to-list price ratio for the region; year-over-year price trend (direction and % change); any notable local factors such as new development, employment shifts, seasonal patterns, or rate environment. Preferred sources: CREA national stats, local real estate board releases (Cornerstone Association of REALTORS, KWAR), Wahi, Zolo, RE/MAX and Royal LePage market reports. If board-level stats are provided in the input, prioritize those over public sources.

Present the regional summary as a brief market snapshot before the comparable cards, and reference regional conditions explicitly in the pricing rationale.

STEP 2 — Organize the Comparables

Sort all provided comparables into three tiers. S — Sold: most weight, these are the ground truth of what buyers have actually paid. P — Pending: strong signal for current buyer behaviour and market direction. A — Active: establishes competition and buyer psychology, not value confirmation.

For each comp extract and present: address, status, beds/baths/sq ft, price (list and sold where available), DOM, $/sq ft, SP/LP % where available, and key notes on standout features or red flags. Flag outliers and explain why they should be weighted differently.

STEP 3 — Run the Core Analysis

For Sold comparables: calculate average and median sold price, average $/sq ft, average DOM, and average SP/LP ratio. Identify the best and weakest comps and explain why. For Pending comparables: note list prices and DOM as indicators of current demand, flag any multiple-offer situations, and use as a forward-looking market signal. For Active comparables: establish the current competing inventory the subject will face, and identify pricing pressure points and psychological price thresholds.

STEP 4 — Present the Valuation Adjustments

When "analysis.feature_adjustments" is supplied, present those entries verbatim: feature name, the supplied adjustment range (formatted e.g. +$15,000–$20,000, or −$10,000–−$15,000 for moderating adjustments), and the supplied rationale. Do not add adjustments of your own, do not resize the supplied ranges, and do not re-net them into a different conclusion — the recommended price already reflects them.

Only when no analysis block is supplied: starting from the base comparable range established by the sold tier, apply feature-by-feature adjustments yourself (pool, garage type, lot size, renovations, basement finish), stating the feature, the adjustment range, and the rationale, then sum the net adjustment and apply it to the comparable midpoint.

STEP 5 — Price Per Sq Ft Cross-Check

When "analysis.price_per_sqft_cross_check" is supplied, present its comps_used, implied_low–implied_high range, verdict and commentary as given, in a callout box.

Only when no analysis block is supplied: run a secondary $/sq ft validation yourself using total finished area (above grade + finished basement) on the 2–3 most functionally similar comps, showing the implied value range and whether it aligns with or challenges the adjustment-based conclusion.

STEP 6 — Opinion of Value

Present three scenarios: Conservative (minimal prep, standard marketing), Most Probable Value (professional staging, targeted marketing), Optimistic (ideal conditions, multiple offers, prime timing) — using "analysis.valuation_scenarios" prices and rationales verbatim when supplied. Then state the single point Evaluator's Opinion of Value with the date and address: that figure is "analysis.pricing_band_recommended" exactly as supplied. Be decisive — never a range as the final answer, and never a number that differs from the supplied recommendation.

STEP 7 — Suggested List Price

The suggested list price IS "analysis.pricing_band_recommended". Print it exactly — no $5,000 rounding, no alternative band. Express $/sq ft as a secondary anchor. Provide a brief pricing rationale — why this number, what it accomplishes strategically, and how it positions the property relative to active competition — drawing on the supplied market_narrative, feature_adjustments and cross-check rather than new arithmetic. When no analysis block is supplied, recommend a specific list price or narrow $5,000 band of your own.

STEP 8 — Listing Strategy and Recommendations

Provide: the top 3–5 marketing differentiators the agent should lead with in all listing materials; preparation recommendations (staging, repairs, photography priorities) with estimated cost and ROI where relevant; and market timing commentary based on what the active and pending tier reveals about current demand.

TONE AND STYLE

Be direct and confident. Sellers and agents need clarity, not hedging. Use plain language — no jargon the average homeowner would not understand. Lead with the answer and support with analysis. If the comparable set is thin or geographically stretched, flag that explicitly and explain how it affects confidence in the conclusion.

BRAND

All reports are prepared under Luxe Realty Group branding. Use the Luxe Realty Group name and website (luxerealtygroup.ca) throughout all outputs. Do not reference any other brokerage or team name.

OUTPUT FORMAT — EDITORIAL CMA DOCUMENT

Produce the final CMA as a single structured HTML document using the following design system. Do not produce plain text, markdown tables, or MLS-style printouts. The final output must feel like a luxury editorial property valuation — think Architectural Digest meets a premium advisory firm, not a spreadsheet.

Colour System

Background: Warm Ivory #F6F1EA
Primary Text: Charcoal #1C1C1C
Accent: Soft Bronze #B38A5A
Secondary: Taupe #C7B8A6
White: #FFFFFF

No red. No blue. No MLS-style colour coding.

Typography

Headlines: Cormorant Garamond or Playfair Display (import from Google Fonts)
Body: Montserrat or Lato
Accent/pull quotes: italic Cormorant Garamond
Font sizes: section headlines 32–40px, body 14–16px, stat callouts 48–60px

Layout Rules

Full-width sections with generous white space
Never use raw HTML tables for comparable data — use styled cards instead
Every section has a clear header with a thin bronze rule beneath it
Pull quotes and opinion of value use oversized type as a design element
Two-column layouts for value drivers and strategy sections
Pricing analysis uses a visual pricing ladder, not a table

Page Structure — follow this order exactly:

Cover — Property address as large headline, "Home Evaluation" subhead, "Prepared Exclusively For [Client Name]", agent name and brokerage name, date
Property Snapshot — Large feature callout cards (not a table) for: beds, baths, sq ft, lot, garage, year built. If there is an income suite or standout feature, give it a dedicated luxury callout box with rental income estimate if applicable.
Market Pulse — One large editorial statement about current market conditions in the submarket. Three stat cards: Market Condition, Avg Days on Market, Sale-to-List Ratio. Source data from Step 1 web search results.
Comparable Properties — One card per comp. Each card includes: address, status badge (SOLD / PENDING / ACTIVE in styled pill), price, beds/baths/sq ft, $/sq ft, DOM, and a one-line agent note. No raw table rows.
Value Drivers — Two-column layout. Left: "What Adds Value" bullet list with bronze checkmarks. Right: "What Buyers May Consider" with neutral styling. No negative framing — position everything professionally.
Pricing Analysis — Visual pricing ladder showing: Comparable Range → Adjusted Range → Target Position. Callout box for $/sq ft cross-check. Avoid tables.
Opinion of Value — Full-width hero section. The recommended value as a very large number (60px+). One supporting paragraph in italic Cormorant Garamond. Then the suggested list price in a bronze-accented box.
Strategy & Next Steps — Three columns: Preparation / Marketing / Launch. Brief bullet points in each. End with an editorial closing line in large italic type: "Every home has a story. Our job is to ensure buyers see its value." Followed by agent contact info and Luxe Realty Group branding.
Disclaimer — Small text, bottom of final page: This CMA is a side-by-side comparison of homes for sale and recently sold in the same neighbourhood and price range. It is prepared for informational and listing strategy purposes. Information is sourced from MLS data and is deemed reliable but not guaranteed. All values represent professional opinion only and do not constitute a regulated MPAC assessment or a formal CREA appraisal. Prepared by Luxe Realty Group | luxerealtygroup.ca

CRITICAL: Return ONLY the final HTML document as your response. No preamble, no explanation, no markdown code fences — just the raw HTML starting with <!DOCTYPE html> or the opening tag, ready to render or save directly.`;

async function callAnthropic(messages: any[]): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 6 },
      ],
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Anthropic error:", res.status, t);
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  return await res.json();
}

function extractFinalHtml(content: any[]): string {
  const textBlocks = (content || []).filter((b: any) => b.type === "text").map((b: any) => b.text || "");
  let text = textBlocks.join("\n").trim();
  // Strip markdown fences if any
  text = text.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const body = await req.json();
    console.log("generate-cma: request", { client: body?.clientName, address: body?.subjectProperty?.address });

    // Identify caller (for usage tracking). verify_jwt is off, so parse the
    // Authorization header ourselves using the anon key.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let callerUserId: string | null = null;
    let callerOrgId: string | null = null;
    if (token) {
      const { data: userData } = await admin.auth.getUser(token);
      callerUserId = userData?.user?.id ?? null;
      if (callerUserId) {
        const { data: prof } = await admin
          .from("profiles")
          .select("org_id")
          .eq("id", callerUserId)
          .maybeSingle();
        callerOrgId = (prof as any)?.org_id ?? null;
      }
    }

    // ---- Single source of truth -------------------------------------------
    // cma-analyze owns pricing. When a reportId is supplied we load the audited
    // analysis straight from the report row so the client document can never
    // disagree with the audit view. A caller-supplied `analysis` is a fallback.
    let analysis: any = body?.analysis ?? null;
    let pendingCount = 0;
    if (body?.reportId) {
      const { data: r, error: rErr } = await admin
        .from("cma_reports")
        .select(
          "cma_grade, pricing_band_low, pricing_band_recommended, pricing_band_high, pricing_confidence, strategy_recommendation, risk_flags, weak_comp_alerts, adjustment_observations, feature_adjustments, price_per_sqft_cross_check, valuation_scenarios, talking_points, seller_objections, market_narrative, extracted_comps, ai_raw_response",
        )
        .eq("id", body.reportId)
        .maybeSingle();
      if (rErr) console.error("generate-cma: report load failed", rErr);
      if (r) {
        const raw = (r as any).ai_raw_response || {};
        analysis = {
          cma_grade: r.cma_grade,
          pricing_band_low: r.pricing_band_low,
          pricing_band_recommended: r.pricing_band_recommended,
          pricing_band_high: r.pricing_band_high,
          pricing_confidence: r.pricing_confidence,
          strategy_recommendation: r.strategy_recommendation,
          risk_flags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
          weak_comp_alerts: Array.isArray(r.weak_comp_alerts) ? r.weak_comp_alerts : [],
          adjustment_observations: Array.isArray(r.adjustment_observations) ? r.adjustment_observations : [],
          feature_adjustments: Array.isArray((r as any).feature_adjustments) ? (r as any).feature_adjustments : [],
          price_per_sqft_cross_check: (r as any).price_per_sqft_cross_check ?? null,
          valuation_scenarios: (r as any).valuation_scenarios ?? null,
          talking_points: Array.isArray(r.talking_points) ? r.talking_points : [],
          seller_objections: Array.isArray(r.seller_objections) ? r.seller_objections : [],
          market_narrative: r.market_narrative,
          market_classification: raw.market_classification ?? null,
          market_stats_derived: raw.market_stats_derived ?? null,
          web_market_context: raw.web_market_context ?? null,
        };
        const comps = Array.isArray(r.extracted_comps) ? r.extracted_comps : [];
        pendingCount = comps.filter(
          (c: any) => String(c?.comp_category || "").toLowerCase() === "pending",
        ).length;
      }
    }
    if (!pendingCount && Array.isArray(body?.comparables)) {
      pendingCount = body.comparables.filter(
        (c: any) => String(c?.status || "").toLowerCase() === "pending",
      ).length;
    }

    const recommended = Number(analysis?.pricing_band_recommended);
    const payload = { ...body, analysis: analysis ?? undefined };

    const messages: any[] = [
      { role: "user", content: JSON.stringify(payload) },
    ];

    let final: any = null;
    for (let i = 0; i < 10; i++) {
      const resp = await callAnthropic(messages);
      const stop = resp.stop_reason;
      const blockTypes = (resp.content || []).map((b: any) => b.type);
      console.log(`generate-cma: round ${i} stop_reason=${stop} blocks=${blockTypes.join(",")}`);

      // Append assistant turn
      messages.push({ role: "assistant", content: resp.content });

      // Server-side web_search: Anthropic executes the tool inline and returns
      // server_tool_use + web_search_tool_result blocks in the assistant turn.
      // If stop_reason is "pause_turn" or "tool_use" (with only server tools),
      // we must re-call the API with the assistant turn as-is so Claude
      // continues generating. Only "end_turn" / "stop_sequence" are final.
      if (stop === "end_turn" || stop === "stop_sequence") {
        final = resp;
        break;
      }

      // Handle any client-side tool_use (none defined here, but guard anyway)
      const clientToolUses = (resp.content || []).filter(
        (b: any) => b.type === "tool_use"
      );
      if (clientToolUses.length > 0) {
        const toolResults = clientToolUses.map((tu: any) => ({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "ok",
        }));
        messages.push({ role: "user", content: toolResults });
      }
      // Otherwise (pause_turn or server-only tool_use), loop and let Claude continue.
    }

    if (!final) throw new Error("No final response from Anthropic");

    const rawHtml = extractFinalHtml(final.content || []);
    if (!rawHtml || !/<[a-z!]/i.test(rawHtml)) {
      console.error("generate-cma: no HTML in final response", final);
      throw new Error("Model did not return HTML");
    }

    // Same guardrails cma-analyze applies to its JSON: no banned branding, one
    // canonical recommended price, no pending claims without pending comps.
    const html = applyHtmlGuardrails(rawHtml, {
      recommended: Number.isFinite(recommended) ? recommended : null,
      pendingCount,
    });

    // Log successful generation for monthly usage caps (best-effort).
    if (callerUserId && callerOrgId) {
      const { error: logErr } = await admin
        .from("cma_generations")
        .insert({ user_id: callerUserId, org_id: callerOrgId });
      if (logErr) console.error("generate-cma: usage log failed", logErr);
    } else {
      console.warn("generate-cma: skipped usage log (missing user/org)", { callerUserId, callerOrgId });
    }

    return new Response(JSON.stringify({ success: true, html }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cma error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});