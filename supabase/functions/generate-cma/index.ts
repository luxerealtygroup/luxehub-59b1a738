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

// Streamed so a long document keeps the connection alive instead of hitting the
// platform request timeout. The audited analysis is the source of truth for
// every figure, so no web search is needed here — dropping it also removes the
// pause/resume round trips that made generation drag.
async function callAnthropic(
  messages: any[],
): Promise<{ text: string; stop: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      stream: true,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Anthropic error:", res.status, t);
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Anthropic returned no body");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stop = "end_turn";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt: any;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text || "";
      } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
        stop = evt.delta.stop_reason;
      } else if (evt.type === "error") {
        throw new Error(`Anthropic stream error: ${evt.error?.type || "unknown"}`);
      }
    }
  }
  return { text, stop };
}

function stripFences(text: string): string {
  return (text || "")
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trimStart();
}

function cleanText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [humanizeLabel(key), cleanText(nested)] as const)
      .filter(([, nested]) => nested);
    return entries.map(([key, nested]) => `${key}: ${nested}`).join("; ");
  }
  return String(value)
    .replace(/\bfi\s+eld\b/gi, "field")
    .replace(/\bfi\s+nished\b/gi, "finished")
    .replace(/\bfi\s+replace\b/gi, "fireplace")
    .replace(/MOST_PROBABLE/g, "Most probable")
    .replace(/most_probable/gi, "Most probable")
    .replace(/--+/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: unknown): string {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanizeLabel(value: unknown): string {
  const text = cleanText(value).replace(/_/g, " ");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositiveNumber(value: unknown): number | null {
  const n = toNumber(value);
  return n != null && n > 0 ? Math.round(n) : null;
}

function money(value: unknown, empty = "Not reported"): string {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount)
    : empty;
}

function signedMoney(value: unknown): string {
  const amount = toNumber(value);
  if (amount == null) return "Not stated";
  if (Math.round(amount) === 0) return "$0";
  return `${amount < 0 ? "−" : "+"}${money(Math.abs(amount))}`;
}

function adjustmentRange(low: unknown, high: unknown): string {
  const l = toNumber(low);
  const h = toNumber(high);
  if (l == null && h == null) return "Not stated";
  if (l == null) return signedMoney(h);
  if (h == null) return signedMoney(l);
  if (Math.round(l) === 0 && Math.round(h) === 0) return "No separate dollar adjustment";
  if (Math.round(l) === Math.round(h)) return signedMoney(l);
  return `${signedMoney(l)} to ${signedMoney(h)}`;
}

function shouldShowAdjustment(adjustment: any): boolean {
  const l = toNumber(adjustment?.adjustment_low);
  const h = toNumber(adjustment?.adjustment_high);
  if (l == null && h == null) return Boolean(cleanText(adjustment?.rationale));
  return Math.round(l || 0) !== 0 || Math.round(h || 0) !== 0 || Boolean(cleanText(adjustment?.rationale));
}

function normalizeAddress(value: unknown): string {
  const raw = cleanText(value).replace(/\.+$/g, "");
  if (!raw) return "Address not reported";
  return raw.split(",")[0].split(" ").filter(Boolean).map((part) => {
    const compact = part.replace(/\.$/, "");
    if (/^\d+[a-z]?$/i.test(compact)) return compact.toUpperCase();
    const lower = compact.toLowerCase();
    if (["on", "n", "s", "e", "w", "ne", "nw", "se", "sw"].includes(lower)) return lower.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}

function sqftLabel(value: unknown): string {
  const n = toPositiveNumber(value);
  return n ? `${n.toLocaleString("en-US")} sq ft` : "Sq ft not reported";
}

function compSqftLabel(comp: any): string {
  const ag = toPositiveNumber(comp?.ag_sqft ?? comp?.above_grade_sqft);
  const bg = toPositiveNumber(comp?.bg_sqft ?? comp?.finished_basement_sqft);
  const total = toPositiveNumber(comp?.sqFt ?? comp?.sqft ?? comp?.sq_ft);
  if (ag && bg) return `${ag.toLocaleString("en-US")} AG + ${bg.toLocaleString("en-US")} BG sq ft`;
  if (ag) return `${ag.toLocaleString("en-US")} above-grade sq ft`;
  if (total) return `${total.toLocaleString("en-US")} sq ft reported`;
  return "Sq ft not reported";
}

function compStatus(comp: any): string {
  const raw = cleanText(comp?.comp_category ?? comp?.status).toLowerCase();
  if (raw.includes("pending")) return "Pending";
  if (raw.includes("active")) return "Active";
  if (raw.includes("expired") || raw.includes("withdrawn") || raw.includes("terminated")) return "Expired";
  if (raw.includes("sold") || raw.includes("closed") || toPositiveNumber(comp?.soldPrice ?? comp?.sold_price)) return "Sold";
  return "Comparable";
}

function compPrice(comp: any, mode: "primary" | "list" | "sold" = "primary"): string {
  if (mode === "list") return money(comp?.listPrice ?? comp?.list_price);
  if (mode === "sold") return money(comp?.soldPrice ?? comp?.sold_price);
  return money(toPositiveNumber(comp?.soldPrice ?? comp?.sold_price) ?? toPositiveNumber(comp?.listPrice ?? comp?.list_price));
}

function dateLabel(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function percentLabel(value: unknown): string {
  const n = toNumber(value);
  return n == null ? "Not reported" : `${Math.round(n * 10) / 10}%`;
}

function list(items: unknown, empty = "No material concerns were identified."): string {
  const values = Array.isArray(items) ? items.map(cleanText).filter(Boolean) : [];
  if (!values.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function scenarioEntries(scenarios: unknown, analysis: any): Array<{ label: string; price: number | null; rationale: string }> {
  const raw = scenarios && typeof scenarios === "object" && !Array.isArray(scenarios) ? scenarios as Record<string, unknown> : {};
  const fallback = {
    conservative: { price: analysis?.pricing_band_low, rationale: "Lower-risk position for a faster launch." },
    most_probable: { price: analysis?.pricing_band_recommended, rationale: "The approved recommended list price." },
    optimistic: { price: analysis?.pricing_band_high, rationale: "Upper-end result if buyer response is strong." },
  };
  return [
    ["Conservative", raw.conservative ?? fallback.conservative],
    ["Most probable", raw.most_probable ?? raw.mostProbable ?? fallback.most_probable],
    ["Optimistic", raw.optimistic ?? fallback.optimistic],
  ].map(([label, value]) => {
    const objectValue = value && typeof value === "object" ? value as Record<string, unknown> : null;
    return {
      label: String(label),
      price: typeof value === "number" ? value : toPositiveNumber(objectValue?.price ?? value),
      rationale: objectValue ? cleanText(objectValue.rationale ?? objectValue.description) : "",
    };
  }).filter((entry) => entry.price != null || entry.rationale);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildAuditedCmaHtml(payload: any, analysis: any): string {
  const subject = payload?.subjectProperty ?? {};
  const address = normalizeAddress(subject.address || "Subject Property");
  const comparables = Array.isArray(payload?.comparables) ? payload.comparables : [];
  const scenarios = scenarioEntries(analysis?.valuation_scenarios, analysis);
  const adjustments = Array.isArray(analysis?.feature_adjustments) ? analysis.feature_adjustments.filter(shouldShowAdjustment) : [];
  const crossCheck = analysis?.price_per_sqft_cross_check ?? {};
  const date = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "America/Toronto" }).format(new Date());
  const marketStats = analysis?.market_stats_derived ?? payload?.marketStats ?? {};
  const launchText = cleanText(analysis?.approved_strategy ?? analysis?.strategy_recommendation);

  const compCards = comparables.length
    ? comparables.map((comp: any) => {
      return `<article class="card"><span class="badge">${escapeHtml(compStatus(comp))}</span><h3>${escapeHtml(normalizeAddress(comp.address))}</h3><div class="price">${escapeHtml(compPrice(comp))}</div><p>${escapeHtml(cleanText(comp.beds) || "Not reported")} beds · ${escapeHtml(cleanText(comp.baths) || "Not reported")} baths · ${escapeHtml(compSqftLabel(comp))} · ${escapeHtml(cleanText(comp.dom ?? comp.days_on_market) || "Not reported")} DOM</p><p class="muted">List ${escapeHtml(compPrice(comp, "list"))} · Sold ${escapeHtml(compPrice(comp, "sold"))}${dateLabel(comp.sale_date) ? ` · ${escapeHtml(dateLabel(comp.sale_date))}` : ""}</p>${cleanText(comp.notes || comp.agent_note) ? `<p class="muted">${escapeHtml(comp.notes || comp.agent_note)}</p>` : ""}</article>`;
    }).join("")
    : `<p class="muted">Comparable details are contained in the approved analysis.</p>`;

  const scenarioCards = scenarios.length
    ? scenarios.map((scenario) => `<article class="card"><p class="eyebrow">${escapeHtml(scenario.label)}</p><div class="price">${money(scenario.price)}</div><p>${escapeHtml(scenario.rationale)}</p></article>`).join("")
    : `<article class="card"><p class="eyebrow">Recommended value</p><div class="price">${money(analysis.pricing_band_recommended)}</div></article>`;

  const keyFeatures = Array.isArray(subject.keyFeatures) ? subject.keyFeatures.map(cleanText).filter(Boolean) : [];
  const addsValue = keyFeatures.length ? list(keyFeatures, "") : list(analysis.adjustment_observations, "The property will be positioned around the strongest comparable evidence.");
  const buyerConsiderations = list(analysis.risk_flags, "No material buyer concerns were identified in the approved review.");
  const crossUsed = Array.isArray(crossCheck?.comps_used) ? crossCheck.comps_used : [];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Home Evaluation — ${escapeHtml(address)}</title><style>
  :root{--ivory:#F6F1EA;--ink:#1C1C1C;--bronze:#B38A5A;--taupe:#C7B8A6;--paper:#FFFFFF}*{box-sizing:border-box}body{margin:0;background:var(--ivory);color:var(--ink);font:15px/1.65 Arial,sans-serif}main{max-width:1050px;margin:auto;background:var(--paper)}section{padding:56px 7%}section+section{border-top:1px solid var(--taupe)}h1,h2,h3{font-family:Georgia,serif;font-weight:400;margin:0 0 18px}h1{font-size:56px;line-height:1.05}h2{font-size:34px;border-bottom:2px solid var(--bronze);padding-bottom:12px}.cover{min-height:720px;display:flex;flex-direction:column;justify-content:center;background:var(--ink);color:var(--ivory)}.eyebrow{color:var(--bronze);font-weight:700;text-transform:uppercase;letter-spacing:.08em}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.two{grid-template-columns:repeat(2,1fr)}.card{border:1px solid var(--taupe);padding:22px;break-inside:avoid}.badge{display:inline-block;color:var(--bronze);font-weight:700;text-transform:uppercase}.price{font:36px Georgia,serif;margin:8px 0}.value{font:64px Georgia,serif;color:var(--bronze);line-height:1}.muted{color:#655f58}.lead{font-size:18px;line-height:1.7}.ladder{display:flex;gap:16px;align-items:stretch}.ladder .card{flex:1}ul{padding-left:20px}.opinion{text-align:center;background:var(--ink);color:var(--ivory)}.opinion h2{border:0}.fine{font-size:11px}@media(max-width:700px){h1{font-size:40px}.grid,.two{grid-template-columns:1fr}.ladder{display:block}.ladder .card{margin-bottom:14px}.value{font-size:48px}section{padding:40px 6%}}@media print{body{background:#fff}section{break-inside:avoid}.cover{break-after:page}}
  </style></head><body><main>
  <section class="cover"><p class="eyebrow">Home Evaluation</p><h1>${escapeHtml(address)}</h1><p>Prepared exclusively for ${escapeHtml(payload?.clientName || "our client")}</p><p>${escapeHtml(payload?.agentName || "Luxe Realty Group")} · ${escapeHtml(date)}</p></section>
  <section><h2>Property Snapshot</h2><div class="grid"><article class="card"><p class="eyebrow">Bedrooms</p><div class="price">${escapeHtml(subject.bedrooms || "Not reported")}</div></article><article class="card"><p class="eyebrow">Bathrooms</p><div class="price">${escapeHtml(subject.bathrooms || "Not reported")}</div></article><article class="card"><p class="eyebrow">Finished area</p><div class="price">${escapeHtml(sqftLabel(subject.totalFinishedSqFt || subject.aboveGradeSqFt))}</div></article><article class="card"><p class="eyebrow">Above grade</p><h3>${escapeHtml(sqftLabel(subject.aboveGradeSqFt))}</h3></article><article class="card"><p class="eyebrow">Garage</p><h3>${escapeHtml(humanizeLabel(subject.garage) || "Not reported")}</h3></article><article class="card"><p class="eyebrow">Property type</p><h3>${escapeHtml(humanizeLabel(subject.propertyType) || "Not reported")}</h3></article></div></section>
  <section><h2>Market Pulse</h2><p class="lead">${escapeHtml(analysis.approved_market_conditions || analysis.market_narrative || "Market conditions were considered in the approved pricing analysis.")}</p><div class="grid"><article class="card"><p class="eyebrow">Market condition</p><h3>${escapeHtml(humanizeLabel(analysis.market_classification) || "See analysis")}</h3></article><article class="card"><p class="eyebrow">Avg days on market</p><h3>${escapeHtml(cleanText(marketStats.avg_days_on_market ?? analysis.avg_days_on_market) || "Not reported")}</h3></article><article class="card"><p class="eyebrow">Sale-to-list ratio</p><h3>${escapeHtml(percentLabel(marketStats.sale_to_list_ratio ?? analysis.sale_to_list_ratio))}</h3></article></div></section>
  <section><h2>Comparable Properties</h2><div class="grid">${compCards}</div></section>
  <section><h2>Value Drivers</h2><div class="grid two"><article class="card"><h3>What Adds Value</h3>${addsValue}</article><article class="card"><h3>What Buyers May Consider</h3>${buyerConsiderations}</article></div>${adjustments.length ? `<div class="grid" style="margin-top:18px">${adjustments.slice(0,6).map((a: any) => `<article class="card"><p class="eyebrow">${escapeHtml(a.feature || a.name || "Adjustment")}</p><h3>${escapeHtml(adjustmentRange(a.adjustment_low, a.adjustment_high))}</h3><p class="muted">${escapeHtml(a.rationale || "")}</p></article>`).join("")}</div>` : ""}</section>
  <section><h2>Pricing Analysis</h2><div class="ladder"><article class="card"><p class="eyebrow">Low</p><div class="price">${money(analysis.pricing_band_low)}</div></article><article class="card"><p class="eyebrow">Recommended</p><div class="price">${money(analysis.pricing_band_recommended)}</div></article><article class="card"><p class="eyebrow">High</p><div class="price">${money(analysis.pricing_band_high)}</div></article></div><article class="card" style="margin-top:18px"><h3>Price-per-square-foot cross-check</h3><p>${money(crossCheck.implied_low)} to ${money(crossCheck.implied_high)} · ${escapeHtml(humanizeLabel(crossCheck.verdict) || "See approved analysis")}</p><p>${escapeHtml(crossCheck.commentary || "")}</p>${crossUsed.length ? `<p class="muted">Comps used: ${escapeHtml(crossUsed.map((c: any) => typeof c === "string" ? normalizeAddress(c) : normalizeAddress(c?.address)).join(", "))}</p>` : ""}</article></section>
  <section><h2>Valuation Scenarios</h2><div class="grid">${scenarioCards}</div></section>
  <section class="opinion"><p class="eyebrow">Evaluator's Opinion of Value</p><div class="value">${money(analysis.pricing_band_recommended)}</div><p>${escapeHtml(analysis.approved_price_narrative || analysis.approved_executive_summary || analysis.market_narrative || "The approved analysis supports this recommended market position.")}</p></section>
  <section><h2>Strategy & Next Steps</h2><div class="grid"><article class="card"><h3>Preparation</h3>${list(analysis.adjustment_observations, "Prepare the property to highlight its strongest value drivers.")}</article><article class="card"><h3>Marketing</h3>${list(analysis.talking_points, "Lead with the property's strongest differentiators.")}</article>${launchText ? `<article class="card"><h3>Launch</h3><p>${escapeHtml(launchText)}</p></article>` : ""}</div><p class="price" style="margin-top:42px"><em>Every home has a story. Our job is to ensure buyers see its value.</em></p><p>Luxe Realty Group · luxerealtygroup.ca</p></section>
  <section><p class="fine">This CMA is a side-by-side comparison of homes for sale and recently sold in the same neighbourhood and price range. It is prepared for informational and listing strategy purposes. Information is sourced from MLS data and is deemed reliable but not guaranteed. All values represent professional opinion only and do not constitute a regulated MPAC assessment or a formal CREA appraisal. Prepared by Luxe Realty Group | luxerealtygroup.ca</p></section>
  </main></body></html>`;
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
    const requestedReportId = body?.reportId ?? body?.report_id ?? null;
    if (!requestedReportId) {
      return jsonResponse({ success: false, error: "A saved CMA report is required before generating the client document." }, 400);
    }

    let analysis: any = null;
    let reportPayload: Record<string, unknown> = {};
    let pendingCount = 0;
    if (requestedReportId) {
      if (!callerUserId || !callerOrgId) {
        return jsonResponse({ success: false, error: "Sign in before generating this CMA." }, 401);
      }
      const { data: r, error: rErr } = await admin
        .from("cma_reports")
        .select(
          "org_id, user_id, property_address, city_area, property_type, bedrooms, bathrooms, approx_sqft, above_grade_sqft, finished_basement_sqft, garage, build_year, condition, key_features, fub_person_name, agent_notes, approved_executive_summary, approved_price_narrative, approved_strategy, approved_market_conditions, cma_grade, pricing_band_low, pricing_band_recommended, pricing_band_high, pricing_confidence, strategy_recommendation, risk_flags, weak_comp_alerts, adjustment_observations, feature_adjustments, price_per_sqft_cross_check, valuation_scenarios, talking_points, seller_objections, market_narrative, active_listings, sold_listings, median_sale_price, avg_days_on_market, sale_to_list_ratio, months_of_inventory, extracted_comps, ai_raw_response",
        )
        .eq("id", requestedReportId)
        .maybeSingle();
      if (rErr) console.error("generate-cma: report load failed", rErr);
      if (rErr) return jsonResponse({ success: false, error: "Could not load this CMA report." }, 500);
      if (!r) return jsonResponse({ success: false, error: "CMA report not found." }, 404);
      if (r) {
        const { data: roleRows, error: rolesErr } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUserId)
          .in("role", ["owner", "admin", "operations"]);
        if (rolesErr) console.error("generate-cma: role load failed", rolesErr);
        const elevated = Array.isArray(roleRows) && roleRows.length > 0;
        const reportOrgId = (r as any).org_id ?? null;
        const sameOrg = reportOrgId && reportOrgId === callerOrgId;
        const ownsReport = (r as any).user_id === callerUserId;
        if (!sameOrg || (!ownsReport && !elevated)) {
          return jsonResponse({ success: false, error: "You do not have access to this CMA report." }, 403);
        }
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
        reportPayload = {
          clientName: body?.clientName ?? (r as any).fub_person_name ?? "our client",
          subjectProperty: body?.subjectProperty ?? {
            address: (r as any).property_address,
            propertyType: (r as any).property_type,
            aboveGradeSqFt: (r as any).above_grade_sqft ?? null,
            finishedBasementSqFt: (r as any).finished_basement_sqft ?? null,
            totalFinishedSqFt: (r as any).approx_sqft ?? null,
            bedrooms: (r as any).bedrooms ?? null,
            bathrooms: (r as any).bathrooms ?? null,
            garage: (r as any).garage ?? null,
            keyFeatures: Array.isArray((r as any).key_features) ? (r as any).key_features : [],
            buildYear: (r as any).build_year ?? null,
            condition: (r as any).condition ?? null,
          },
          comparables: body?.comparables ?? comps.map((c: any) => ({
            address: c?.address,
            status: c?.comp_category ?? c?.status,
            beds: c?.beds ?? null,
            baths: c?.baths ?? null,
            sqFt: c?.sqft ?? c?.sqFt ?? null,
            ag_sqft: c?.ag_sqft ?? c?.above_grade_sqft ?? null,
            bg_sqft: c?.bg_sqft ?? c?.finished_basement_sqft ?? null,
            listPrice: c?.list_price ?? c?.listPrice ?? null,
            soldPrice: c?.sold_price ?? c?.soldPrice ?? null,
            dom: c?.days_on_market ?? c?.dom ?? null,
            sale_date: c?.sale_date ?? null,
            notes: [c?.notes, c?.area, c?.is_weak ? `Weak: ${c?.weak_reason || ""}` : ""].filter(Boolean).join(" — "),
          })),
          marketStats: body?.marketStats ?? {
            active_listings: (r as any).active_listings ?? null,
            sold_listings: (r as any).sold_listings ?? null,
            median_sale_price: (r as any).median_sale_price ?? null,
            avg_days_on_market: (r as any).avg_days_on_market ?? null,
            sale_to_list_ratio: (r as any).sale_to_list_ratio ?? null,
            months_of_inventory: (r as any).months_of_inventory ?? null,
          },
          agentNotes: body?.agentNotes ?? (r as any).agent_notes ?? null,
        };
      }
    }
    if (!pendingCount && Array.isArray(body?.comparables)) {
      pendingCount = body.comparables.filter(
        (c: any) => String(c?.status || "").toLowerCase() === "pending",
      ).length;
    }

    const recommended = Number(analysis?.pricing_band_recommended);
    const payload = { ...body, ...reportPayload, analysis: analysis ?? undefined };

    let rawHtml = "";
    if (analysis && Number.isFinite(recommended)) {
      // The pricing audit is already approved. Rendering it deterministically
      // avoids another long model call, preserves every approved figure, and
      // makes report generation complete well inside the request limit.
      rawHtml = buildAuditedCmaHtml(payload, analysis);
      console.log("generate-cma: rendered approved analysis without another model call");
    } else {
      const messages: any[] = [{ role: "user", content: JSON.stringify(payload) }];
      let carriedHtml = "";
      let done = false;
      for (let i = 0; i < 4; i++) {
        const { text, stop } = await callAnthropic(messages);
        console.log(`generate-cma: round ${i} stop_reason=${stop} chars=${text.length}`);
        carriedHtml += stripFences(text);
        if (stop !== "max_tokens") {
          done = true;
          break;
        }
        messages.push({
          role: "user",
          content: "Your previous output was cut off. Continue the HTML document from exactly where it stops. Output only the remaining markup.",
        });
      }
      if (!done) console.warn("generate-cma: document still truncated after continuations");
      rawHtml = carriedHtml.trim();
    }
    if (!rawHtml || !/<[a-z!]/i.test(rawHtml)) {
      console.error("generate-cma: no HTML in final response");
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