import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_SYSTEM_PROMPT = `You are a real estate CMA data extraction specialist. Extract ALL comparable property listings from the provided HTML content of a CloudCMA report page.

CloudCMA reports display properties as cards/blocks with:
- Street address
- City/area
- MLS number
- Price (list and/or sold)
- Bedrooms & bathrooms
- Square footage
- Status (Sold/Closed, Pending, Active, Expired)
- Days on market
- Sale/sold date

RULES:
1. Extract EVERY property listing you find. Do NOT skip any.
2. The subject property may appear first - do NOT include it as a comparable if it matches the subject address provided.
3. Missing fields should be null.
4. Assign comp_category: "Closed"/"Sold" = sold, "Active" = active, "Pending" = active, "Expired" = expired
5. Assign confidence: 1.0 = all key fields, 0.7 = most fields, 0.5 = partial, 0.3 = minimal
6. Set needs_review: true if price OR beds/baths are missing

RESPOND WITH ONLY this JSON (no markdown, no code blocks):
{
  "extracted_comps": [
    {
      "address": "string",
      "area": "string or empty",
      "beds": number or null,
      "baths": number or null,
      "sqft": number or null,
      "list_price": number or null,
      "sold_price": number or null,
      "days_on_market": number or null,
      "sale_date": "string or null",
      "mls_number": "string or null",
      "is_weak": false,
      "weak_reason": null,
      "comp_category": "sold|active|expired|other",
      "confidence": number,
      "needs_review": boolean,
      "needs_review_reason": "string or null"
    }
  ],
  "extraction_summary": {
    "total_comps_found": number,
    "sold_count": number,
    "active_count": number,
    "expired_count": number,
    "needs_review_count": number,
    "extraction_notes": "string"
  }
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { url, subjectAddress } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching CloudCMA URL: ${parsedUrl.href}`);

    // Fetch the page HTML
    const fetchResponse = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!fetchResponse.ok) {
      console.error(`Fetch failed: ${fetchResponse.status}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch the CloudCMA page (HTTP ${fetchResponse.status}). The link may be expired or private.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await fetchResponse.text();
    console.log(`Fetched HTML length: ${html.length}`);

    if (html.length < 200) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "The page appears to be empty or inaccessible. Check the link and try again.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip script/style tags and extract meaningful text content
    let cleanedHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    // Limit to 100k chars for AI processing
    if (cleanedHtml.length > 100000) {
      cleanedHtml = cleanedHtml.substring(0, 100000);
    }

    // Call AI to extract comps from the HTML
    const extractionPrompt = `Extract ALL comparable properties from this CloudCMA report HTML page.

${subjectAddress ? `SUBJECT PROPERTY (do NOT include as a comparable): ${subjectAddress}` : ""}

HTML CONTENT:
${cleanedHtml}

Find every property listing on this page and extract all available data.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: extractionPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI error:", status, errorText);
      throw new Error(`AI processing failed (${status})`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", jsonStr.substring(0, 500));
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to automatically extract comparables from this link. You can still add comparables manually.",
          extracted_comps: [],
          extraction_summary: { total_comps_found: 0 },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const comps = parsed.extracted_comps || [];
    const summary = parsed.extraction_summary || {
      total_comps_found: comps.length,
      sold_count: comps.filter((c: any) => c.comp_category === "sold").length,
      active_count: comps.filter((c: any) => c.comp_category === "active").length,
      expired_count: comps.filter((c: any) => c.comp_category === "expired").length,
      needs_review_count: comps.filter((c: any) => c.needs_review).length,
    };

    console.log(`Extracted ${comps.length} comps from CloudCMA link`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_comps: comps,
        extraction_summary: {
          ...summary,
          source_type: "link",
          source_url: parsedUrl.href,
          html_length: html.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("CloudCMA link scrape error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unable to automatically extract comparables from this link. ${msg}`,
        extracted_comps: [],
        extraction_summary: { total_comps_found: 0 },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
