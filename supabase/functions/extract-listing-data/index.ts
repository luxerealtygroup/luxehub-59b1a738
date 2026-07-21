import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const EXTRACTION_PROMPT = `You are extracting the subject property details from a standard MLS "Member Full" sheet. Return ONLY a JSON object (no markdown fences, no explanation) with exactly this shape:

{
  "address": string,
  "city": string,
  "area": string or null,
  "propertyType": string (detached, semi, townhouse, condo, etc),
  "aboveGradeSqFt": number or null,
  "finishedBasementSqFt": number or null,
  "totalFinishedSqFt": number or null,
  "bedrooms": string (e.g. "5+1" meaning 5 above-grade + 1 below),
  "bathrooms": string (e.g. "4" total, or "3 full, 1 half"),
  "listPrice": number or null,
  "originalListPrice": number or null,
  "listingStatus": string or null (active | sold | expired | terminated | conditional),
  "garage": string (single, double, triple, detached, attached, none),
  "keyFeatures": array of strings,
  "buildYear": number or null,
  "ageRange": string or null,
  "condition": string,
  "priorMlsListing": string or null
}

FIELD-BY-FIELD GUIDANCE — labels vary across boards, so follow these rules:

- "bedrooms": Use the TOTAL from the "Beds (AG+BG)" or "Bedrooms (AG+BG)" field, e.g. "6 (5 + 1)" → return "5+1". Do NOT use the per-floor breakdown table. If only a single number is present, return that number as a string ("3").
- "bathrooms": Use the TOTAL from "Baths (F+H)" or "Washrooms (F+H)". e.g. "4 (4 + 0)" → return "4" (or "4 full, 0 half"). Include halves if present, e.g. "3 full, 1 half".
- "city": Derive from the property address line — this is the actual municipality (e.g. "195 Green Vista Drive, Cambridge" → "Cambridge"). Do NOT use the community/neighborhood name in its place.
- "area": The community/area label (e.g. "13 - Galt North | 33 - Clemens Mills/Saginaw" → "Galt North / Clemens Mills-Saginaw"). Null if not stated.
- "listPrice": Current asking price from the "List Price" field. If the listing is Expired/Sold/Terminated, still return List Price here AND populate "originalListPrice" if visible.
- "originalListPrice": Only if the sheet shows an original/previous list price distinct from current list price.
- "listingStatus": Active/Sold/Expired/Terminated/Conditional if visible.
- "aboveGradeSqFt": From "Apx Sqft" / "Above Grade Sq Ft" / MPAC size (the main-floor + upper-floor finished area).
- "finishedBasementSqFt": Only if the sheet lists finished basement area separately. Null if unfinished or not stated.
- "totalFinishedSqFt": aboveGradeSqFt + finishedBasementSqFt when both are known, otherwise the single total quoted.
- "garage": From the "Garage & Parking" or "Garage Type" section — e.g. "Attached (Double)" → "double attached".
- "buildYear": Exact year from "Year Built" if given. If only "Apx Age" like "16-30" is given, leave buildYear null and populate "ageRange".
- "ageRange": Bucket from "Apx Age" (e.g. "16-30", "31-50", "New") when exact year is unknown.
- "condition": Overall condition wording used on the sheet ("Excellent", "Good", "Renovated Throughout", etc). Default to "Good" if unstated.
- "keyFeatures": Extract STANDOUT features from Public Remarks, Interior/Exterior sections, Inclusions, Extras. Examples: "In-ground pool", "Backs onto pond/ravine", "Walkout basement", "Fully finished basement with wet bar", "Chef's kitchen with granite counters", "Attached double garage", "Primary with walk-in closet & 5-pc ensuite", "Hardwood throughout", "Main-floor office", "Fenced yard", "Recent roof (2022)". Include anything that would justify a pricing adjustment (pool, ravine/waterfront lot, walkout, in-law suite, garage type, major renos, premium finishes). Return 4–10 items.
- "priorMlsListing": If the sheet shows prior MLS history for this same address, summarize briefly ("Previously listed at $1,049,000, expired 2024-08"). Null otherwise.

If a field truly isn't present, use null (or an empty string for text fields) rather than guessing. Do not fabricate data.`;

function safeJsonParse(text: string): any {
  let t = (text || "").trim();
  t = t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return JSON.parse(t);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdfBase64 } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(JSON.stringify({ error: "Missing pdfBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = pdfBase64.includes(",") ? pdfBase64.split(",").pop()! : pdfBase64;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: clean,
                },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "Anthropic API failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const raw = textBlock?.text || "";

    let subjectProperty: any;
    try {
      subjectProperty = safeJsonParse(raw);
    } catch (e) {
      console.error("Failed to parse JSON:", raw);
      return new Response(JSON.stringify({ error: "Failed to parse extraction JSON", raw }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, subjectProperty }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("extract-listing-data error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});