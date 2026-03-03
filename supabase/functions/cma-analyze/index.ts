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

    const { pdfText, subjectProperty, purchaseHistory, marketStats, existingManualComps } = await req.json();

    const systemPrompt = `You are a real estate CMA (Comparative Market Analysis) expert analyst. You will analyze CMA data and provide a comprehensive audit.

CRITICAL EXTRACTION RULES:
- Search the ENTIRE PDF text across ALL pages, not just the first table you find.
- CloudCMA PDFs often contain MULTIPLE comp tables: Sold Comps, Active Comps, Expired/Withdrawn Comps.
- Extract comps from EVERY section/table found in the PDF.
- Assign each comp a "comp_category": "sold", "active", "expired", or "other".
- Assign each comp a "source_page" number (estimate based on position in the text, starting from 1).
- Assign each comp a "confidence" score from 0.0 to 1.0 based on how clearly the data was extracted (1.0 = all fields clearly present, 0.5 = some fields inferred, <0.3 = uncertain).

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
      "weak_reason": "string or null",
      "comp_category": "sold|active|expired|other",
      "source_page": number,
      "confidence": number
    }
  ],
  "extraction_summary": {
    "total_comps_found": number,
    "sold_count": number,
    "active_count": number,
    "expired_count": number,
    "low_confidence_count": number,
    "extraction_passes": 1
  },
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
1. Extract ALL comparable properties from the CMA PDF text across every page and section
2. Categorize each comp (sold/active/expired/other) based on section headers or context
3. Flag weak comps (distance issues, outdated sales >6 months, size/type mismatch, price outliers >15% from median)
4. Grade the CMA quality (A=excellent comps, tight range; F=poor comps, wide gaps)
5. Generate a pricing band based on comp analysis
6. Analyze market stats to determine market conditions (buyer's/seller's/balanced)
7. Generate a market narrative incorporating the stats
8. Calculate strategy recommendation based on market conditions and comp quality
9. Generate talking points and anticipate seller objections with responses
10. If fewer than 3 comps are found with confidence >= 0.5, re-scan the entire text specifically looking for any property data patterns (addresses with prices, MLS data, tabular data)`;

    const userPrompt = `Analyze this CMA data:

SUBJECT PROPERTY:
${JSON.stringify(subjectProperty, null, 2)}

CLIENT PURCHASE HISTORY:
${JSON.stringify(purchaseHistory, null, 2)}

MARKET STATS:
${JSON.stringify(marketStats, null, 2)}

CMA PDF CONTENT:
${pdfText || "No PDF text extracted - analyze based on available data only."}

Provide your complete analysis as a JSON object. Remember to extract comps from ALL pages and sections, categorize them, and include confidence scores.`;

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

    // Second extraction pass if low confidence / few comps
    const comps = parsed.extracted_comps || [];
    const highConfComps = comps.filter((c: any) => (c.confidence ?? 1) >= 0.5);
    
    if (pdfText && highConfComps.length < 3) {
      console.log(`Low comp count (${highConfComps.length}), running second extraction pass...`);
      
      const retryPrompt = `The previous extraction found only ${highConfComps.length} comps with confidence >= 0.5. 
Re-scan this PDF text very carefully, focusing ONLY on detecting property comp tables. Look for:
- Any addresses with associated prices
- MLS-style data rows
- Tabular data with columns like Address, Price, Beds, Baths, DOM
- Multiple sections (Sold, Active, Expired)

Return ONLY the extracted_comps array in JSON format (no other fields). Include comp_category, source_page, and confidence for each.

PDF TEXT:
${pdfText}`;

      try {
        const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You extract property comparable data from CMA PDFs. Return only a JSON object with an 'extracted_comps' array. No markdown." },
              { role: "user", content: retryPrompt },
            ],
          }),
        });

        if (retryResponse.ok) {
          const retryResult = await retryResponse.json();
          const retryContent = retryResult.choices?.[0]?.message?.content || "";
          try {
            const retryJson = JSON.parse(retryContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
            const retryComps = retryJson.extracted_comps || retryJson || [];
            if (Array.isArray(retryComps) && retryComps.length > comps.length) {
              parsed.extracted_comps = retryComps;
              parsed.extraction_summary = {
                ...parsed.extraction_summary,
                total_comps_found: retryComps.length,
                extraction_passes: 2,
              };
            }
          } catch {
            console.error("Failed to parse retry extraction");
          }
        }
      } catch (retryErr) {
        console.error("Retry extraction failed:", retryErr);
      }
    }

    // Ensure extraction_summary exists
    if (!parsed.extraction_summary) {
      const finalComps = parsed.extracted_comps || [];
      parsed.extraction_summary = {
        total_comps_found: finalComps.length,
        sold_count: finalComps.filter((c: any) => c.comp_category === 'sold').length,
        active_count: finalComps.filter((c: any) => c.comp_category === 'active').length,
        expired_count: finalComps.filter((c: any) => c.comp_category === 'expired').length,
        low_confidence_count: finalComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
        extraction_passes: 1,
      };
    }

    // Merge with existing manual comps (preserve manual edits)
    if (existingManualComps && Array.isArray(existingManualComps) && existingManualComps.length > 0) {
      const aiComps = parsed.extracted_comps || [];
      // Manual comps are identified by having _manual_edit flag
      const manualComps = existingManualComps.filter((c: any) => c._manual_edit);
      // Merge: keep manual comps, add AI comps that don't duplicate manual addresses
      const manualAddresses = new Set(manualComps.map((c: any) => (c.address || '').toLowerCase().trim()));
      const newAiComps = aiComps.filter((c: any) => !manualAddresses.has((c.address || '').toLowerCase().trim()));
      parsed.extracted_comps = [...manualComps, ...newAiComps];
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
