import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_SYSTEM_PROMPT = `You are a real estate CMA PDF data extraction specialist. Your ONLY job is to find and extract ALL comparable property data from the provided text.

CRITICAL RULES:
1. Search the ENTIRE text from start to finish. Do NOT stop after finding a few properties.
2. CloudCMA PDFs contain MULTIPLE sections: "Sold Comparables", "Active Listings", "Expired/Withdrawn Listings", summary pages, detail pages.
3. Each comparable may appear as: a table row, a property card/block, a detail page, or a summary entry.
4. Extract EVERY property you can identify - even if some fields are missing.
5. For each property, extract whatever fields are available. Missing fields should be null.
6. Assign comp_category based on the section header or context (sold/active/expired/other).
7. Assign confidence: 1.0 = all key fields found, 0.7 = most fields, 0.5 = address + some data, 0.3 = minimal data.
8. Assign needs_review: true if important fields (price, beds/baths) are missing.
9. If a property appears in multiple sections (e.g., summary table AND detail page), merge into one entry with highest confidence data.

Look for these patterns:
- Addresses (street number + street name + optional unit)
- Price patterns ($XXX,XXX or $X,XXX,XXX)
- Property stats (beds/baths/sqft in various formats: "3 BR / 2 BA", "3bd 2ba", "Beds: 3")
- DOM/Days on Market
- MLS numbers
- Date patterns (sold date, list date)
- Table headers like "Address", "Price", "Beds", "Baths", "DOM", "Status"

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
      "is_weak": false,
      "weak_reason": null,
      "comp_category": "sold|active|expired|other",
      "source_page": number,
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
    "low_confidence_count": number,
    "needs_review_count": number,
    "sections_found": ["string"],
    "extraction_notes": "string describing what was found"
  }
}`;

const ANALYSIS_SYSTEM_PROMPT = `You are a real estate CMA (Comparative Market Analysis) expert analyst. Analyze the provided comparable data and market stats to produce a comprehensive CMA audit.

You MUST respond with a JSON object using this exact structure (no markdown, no code blocks, just pure JSON):
{
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
1. Grade the CMA quality (A=excellent comps, tight range; F=poor comps, wide gaps)
2. Generate a pricing band based on comp analysis
3. Flag weak comps (distance issues, outdated sales >6 months, size/type mismatch, price outliers >15% from median)
4. Analyze market stats to determine market conditions
5. Generate talking points and anticipate seller objections`;

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string, model = "google/gemini-2.5-flash") {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("RATE_LIMIT");
    if (status === 402) throw new Error("CREDITS_EXHAUSTED");
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    throw new Error(`AI_ERROR_${status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "";
  const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr);
}

function chunkText(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);
    // Try to break at a newline or space to avoid splitting words
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start + maxChunkSize * 0.7) end = lastNewline + 1;
    }
    chunks.push(text.substring(start, end));
    start = end;
  }
  return chunks;
}

function deduplicateComps(comps: any[]): any[] {
  const seen = new Map<string, any>();
  for (const comp of comps) {
    const key = (comp.address || '').toLowerCase().trim();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || (comp.confidence || 0) > (existing.confidence || 0)) {
      seen.set(key, comp);
    }
  }
  return Array.from(seen.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { pdfText, subjectProperty, purchaseHistory, marketStats, existingManualComps, reviewedComps } = await req.json();

    // If agent already reviewed comps, skip extraction and go straight to analysis
    if (reviewedComps && Array.isArray(reviewedComps) && reviewedComps.length > 0) {
      const analysisPrompt = `Analyze this CMA data using the agent-reviewed comparable properties:

SUBJECT PROPERTY:
${JSON.stringify(subjectProperty, null, 2)}

CLIENT PURCHASE HISTORY:
${JSON.stringify(purchaseHistory, null, 2)}

MARKET STATS:
${JSON.stringify(marketStats, null, 2)}

COMPARABLE PROPERTIES (agent-reviewed):
${JSON.stringify(reviewedComps, null, 2)}

Provide your complete analysis as a JSON object.`;

      const analysis = await callAI(LOVABLE_API_KEY, ANALYSIS_SYSTEM_PROMPT, analysisPrompt);
      
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          ...analysis,
          extracted_comps: reviewedComps,
          extraction_summary: {
            total_comps_found: reviewedComps.length,
            sold_count: reviewedComps.filter((c: any) => c.comp_category === 'sold').length,
            active_count: reviewedComps.filter((c: any) => c.comp_category === 'active').length,
            expired_count: reviewedComps.filter((c: any) => c.comp_category === 'expired').length,
            low_confidence_count: 0,
            needs_review_count: 0,
            extraction_passes: 0,
          },
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === EXTRACTION MODE ===
    if (!pdfText) {
      // No PDF text - analyze based on available data only
      const analysisPrompt = `Analyze this CMA data (no PDF comps available):

SUBJECT PROPERTY:
${JSON.stringify(subjectProperty, null, 2)}

CLIENT PURCHASE HISTORY:
${JSON.stringify(purchaseHistory, null, 2)}

MARKET STATS:
${JSON.stringify(marketStats, null, 2)}

There are no comparable properties extracted from a PDF. Provide analysis based on market stats only.`;

      const analysis = await callAI(LOVABLE_API_KEY, ANALYSIS_SYSTEM_PROMPT, analysisPrompt);
      
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          ...analysis,
          extracted_comps: [],
          extraction_summary: {
            total_comps_found: 0,
            sold_count: 0,
            active_count: 0,
            expired_count: 0,
            low_confidence_count: 0,
            needs_review_count: 0,
            extraction_passes: 0,
          },
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === MULTI-CHUNK EXTRACTION ===
    const MAX_CHUNK_SIZE = 45000; // Leave room for prompt overhead
    const chunks = chunkText(pdfText, MAX_CHUNK_SIZE);
    let allComps: any[] = [];
    let extractionPasses = 0;
    let allSections: string[] = [];
    let extractionNotes: string[] = [];

    console.log(`PDF text length: ${pdfText.length}, chunks: ${chunks.length}`);

    // Pass 1: Extract from each chunk
    for (let i = 0; i < chunks.length; i++) {
      extractionPasses++;
      const chunkLabel = chunks.length > 1 ? ` (chunk ${i + 1} of ${chunks.length})` : '';
      
      const extractionPrompt = `Extract ALL comparable properties from this CMA PDF text${chunkLabel}.

SUBJECT PROPERTY (for context, do NOT include as a comparable):
Address: ${subjectProperty?.address || 'Unknown'}

PDF TEXT${chunkLabel}:
${chunks[i]}

Remember: Extract EVERY property found. Even partial data is valuable. Do not skip any properties.`;

      try {
        const result = await callAI(LOVABLE_API_KEY, EXTRACTION_SYSTEM_PROMPT, extractionPrompt);
        const comps = result.extracted_comps || [];
        console.log(`Chunk ${i + 1}: extracted ${comps.length} comps`);
        allComps.push(...comps);
        
        if (result.extraction_summary?.sections_found) {
          allSections.push(...result.extraction_summary.sections_found);
        }
        if (result.extraction_summary?.extraction_notes) {
          extractionNotes.push(result.extraction_summary.extraction_notes);
        }
      } catch (err) {
        console.error(`Chunk ${i + 1} extraction failed:`, err);
        extractionNotes.push(`Chunk ${i + 1} extraction failed: ${err}`);
      }
    }

    // Deduplicate across chunks
    allComps = deduplicateComps(allComps);
    console.log(`After dedup: ${allComps.length} unique comps`);

    // Pass 2: Retry if too few high-confidence comps found
    const highConfComps = allComps.filter((c: any) => (c.confidence ?? 1) >= 0.5);
    if (highConfComps.length < 3 && pdfText.length > 100) {
      extractionPasses++;
      console.log(`Low comp count (${highConfComps.length}), running focused retry pass...`);

      const retryPrompt = `IMPORTANT: A previous extraction pass found only ${highConfComps.length} comparables with good confidence.

Re-scan this text VERY carefully. Look for ANY property data patterns:
- Street addresses with numbers (e.g., "123 Oak St", "45 Main Street")
- Price values near addresses ($XXX,XXX)
- Property details in any format
- Table rows with property data
- MLS listing data
- "Comparable", "Comp", "Subject" labels followed by property details

Previous extraction found these addresses (do NOT duplicate):
${allComps.map((c: any) => c.address).join(', ')}

PDF TEXT:
${pdfText.substring(0, MAX_CHUNK_SIZE)}

Extract any ADDITIONAL properties not in the list above.`;

      try {
        const retryResult = await callAI(LOVABLE_API_KEY, EXTRACTION_SYSTEM_PROMPT, retryPrompt);
        const retryComps = retryResult.extracted_comps || [];
        console.log(`Retry pass found ${retryComps.length} comps`);
        
        if (retryComps.length > 0) {
          allComps.push(...retryComps);
          allComps = deduplicateComps(allComps);
          extractionNotes.push(`Retry pass found ${retryComps.length} additional comps`);
        }
      } catch (err) {
        console.error("Retry extraction failed:", err);
        extractionNotes.push(`Retry extraction failed: ${err}`);
      }
    }

    // Mark partial extractions as needs_review
    for (const comp of allComps) {
      if (!comp.needs_review) {
        const missingFields: string[] = [];
        if (!comp.address) missingFields.push('address');
        if (comp.sold_price == null && comp.list_price == null) missingFields.push('price');
        if (comp.beds == null && comp.baths == null) missingFields.push('beds/baths');
        
        if (missingFields.length > 0) {
          comp.needs_review = true;
          comp.needs_review_reason = `Missing: ${missingFields.join(', ')}`;
          if (comp.confidence == null || comp.confidence > 0.5) {
            comp.confidence = 0.5;
          }
        }
      }
    }

    // Build extraction summary
    const needsReviewCount = allComps.filter((c: any) => c.needs_review).length;
    const extractionSummary = {
      total_comps_found: allComps.length,
      sold_count: allComps.filter((c: any) => c.comp_category === 'sold').length,
      active_count: allComps.filter((c: any) => c.comp_category === 'active').length,
      expired_count: allComps.filter((c: any) => c.comp_category === 'expired').length,
      low_confidence_count: allComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
      needs_review_count: needsReviewCount,
      extraction_passes: extractionPasses,
      sections_found: [...new Set(allSections)],
      extraction_notes: extractionNotes.join(' | '),
      text_length: pdfText.length,
      chunks_processed: chunks.length,
    };

    // Merge with existing manual comps
    if (existingManualComps && Array.isArray(existingManualComps) && existingManualComps.length > 0) {
      const manualComps = existingManualComps.filter((c: any) => c._manual_edit);
      const manualAddresses = new Set(manualComps.map((c: any) => (c.address || '').toLowerCase().trim()));
      const newAiComps = allComps.filter((c: any) => !manualAddresses.has((c.address || '').toLowerCase().trim()));
      allComps = [...manualComps, ...newAiComps];
    }

    // Now run the analysis pass with the extracted comps
    const analysisPrompt = `Analyze this CMA data with ${allComps.length} comparable properties:

SUBJECT PROPERTY:
${JSON.stringify(subjectProperty, null, 2)}

CLIENT PURCHASE HISTORY:
${JSON.stringify(purchaseHistory, null, 2)}

MARKET STATS:
${JSON.stringify(marketStats, null, 2)}

COMPARABLE PROPERTIES:
${JSON.stringify(allComps, null, 2)}

Provide your complete analysis. Grade quality, generate pricing bands, flag risks, create talking points.`;

    let analysis: any;
    try {
      analysis = await callAI(LOVABLE_API_KEY, ANALYSIS_SYSTEM_PROMPT, analysisPrompt);
    } catch (err) {
      console.error("Analysis pass failed:", err);
      // Return extraction results even if analysis fails
      analysis = {
        cma_grade: null,
        pricing_band_low: null,
        pricing_band_recommended: null,
        pricing_band_high: null,
        pricing_confidence: null,
        risk_flags: ["Analysis pass failed - please re-run"],
        weak_comp_alerts: [],
        adjustment_observations: [],
        talking_points: [],
        seller_objections: [],
        strategy_recommendation: null,
        market_narrative: null,
      };
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        ...analysis,
        extracted_comps: allComps,
        extraction_summary: extractionSummary,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "CREDITS_EXHAUSTED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("CMA analyze error:", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
