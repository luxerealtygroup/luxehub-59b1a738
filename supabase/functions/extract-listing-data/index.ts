import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const EXTRACTION_PROMPT = `Extract the subject property details from this MLS listing PDF. Return ONLY a JSON object (no markdown fences, no explanation) with exactly this shape:

{ "address": string, "propertyType": string (detached, semi, townhouse, condo, etc), "aboveGradeSqFt": number or null, "finishedBasementSqFt": number or null, "totalFinishedSqFt": number or null, "bedrooms": string (e.g. '3+1'), "bathrooms": string (e.g. '2 full, 1 half'), "garage": string (single, double, detached, none), "keyFeatures": array of strings (renovations, pool, in-law suite, notable upgrades, etc), "buildYear": number or null, "condition": string, "priorMlsListing": string (a short summary of the prior list price/history if this IS an old listing, otherwise null) }

If a field isn't present in the listing, use null rather than guessing. Do not fabricate data.`;

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