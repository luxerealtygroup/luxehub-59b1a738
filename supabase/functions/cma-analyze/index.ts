import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_SYSTEM_PROMPT = `You are a real estate CMA PDF data extraction specialist. Your job is to find and extract ALL comparable property data from the provided text.

IMPORTANT: CloudCMA PDFs do NOT use tables. Each comparable appears as a REPEATING PROPERTY BLOCK like this:

[Street Address]
[City, Province/State]
MLS #XXXXXXX
$XXX,XXX
X Beds X Baths
XXXX Sq Ft
[Status: Closed / Pending / Active / Expired]
[Sold Date if applicable]
[Days on Market]

After each property block, there may be multiple pages of property photos, room images, and listing details. IGNORE those image/photo pages. A new comparable starts when you see the next street address + MLS pattern.

DETECTION PATTERNS - look for ANY of these:
1. Street addresses containing: Avenue, Street, Drive, Road, Crescent, Court, Boulevard, Place, Way, Lane, Circle, Trail, Terrace, Ave, St, Dr, Rd, Cres, Ct, Blvd, Pl
2. MLS numbers: "MLS #" or "MLS:" followed by digits
3. Price patterns: $XXX,XXX or $X,XXX,XXX
4. Property stats in ANY format: "3 Beds 2 Baths", "3 BR / 2 BA", "3bd 2ba", "Beds: 3", "3 Bedroom", "3 bed", "3 br"
5. Square footage: "XXXX Sq Ft", "XXXX sqft", "XXXX SF"
6. Status keywords: "Closed", "Sold", "Pending", "Active", "Expired", "Withdrawn"
7. DOM/Days on Market patterns

CRITICAL RULES:
1. Search the ENTIRE text from start to finish. Do NOT stop after finding a few properties.
2. Each property block may span multiple lines with varying formatting.
3. A single listing may have data spread across multiple pages - treat as ONE comparable until a new address/MLS appears.
4. Extract EVERY property you can identify - even if some fields are missing.
5. For each property, extract whatever fields are available. Missing fields should be null.
6. Assign comp_category based on status keywords: "Closed"/"Sold" = sold, "Active" = active, "Pending" = active, "Expired"/"Withdrawn" = expired
7. Assign confidence: 1.0 = all key fields found, 0.7 = most fields, 0.5 = address + some data, 0.3 = minimal data.
8. Assign needs_review: true if important fields (price, beds/baths) are missing.
9. DO NOT include the subject property as a comparable.
10. If text appears garbled or encoded, look for recognizable patterns (addresses, prices, MLS numbers) within the noise.

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
    // Deduplicate by address OR MLS number
    const addrKey = (comp.address || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const mlsKey = (comp.mls_number || '').toLowerCase().trim();
    const key = mlsKey || addrKey;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || (comp.confidence || 0) > (existing.confidence || 0)) {
      seen.set(key, comp);
    }
  }
  return Array.from(seen.values());
}

// Pre-process PDF text to help AI identify property blocks
function preProcessCloudCMAText(text: string): string {
  // Add markers before likely property block starts to help AI parsing
  // Detect address patterns that start property blocks
  const addressPattern = /(\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Avenue|Street|Drive|Road|Crescent|Court|Boulevard|Place|Way|Lane|Circle|Trail|Terrace|Ave|St|Dr|Rd|Cres|Ct|Blvd|Pl|Crt))/gi;
  
  // Count detected addresses for logging
  const matches = text.match(addressPattern);
  if (matches) {
    console.log(`Pre-processing: detected ${matches.length} potential address patterns`);
    console.log(`Sample addresses: ${matches.slice(0, 5).join(' | ')}`);
  }
  
  // Add clear delimiters before each detected address to help AI
  let processed = text.replace(addressPattern, '\n---PROPERTY_BLOCK_START---\n$1');
  
  // Also mark MLS numbers
  processed = processed.replace(/(MLS\s*[#:]?\s*\d+)/gi, '\n[MLS_MARKER] $1');
  
  // Mark price patterns
  processed = processed.replace(/(\$\s*[\d,]+(?:\.\d{2})?)/g, '\n[PRICE_MARKER] $1');
  
  return processed;
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

    // === NO PDF TEXT ===
    if (!pdfText) {
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
            total_comps_found: 0, sold_count: 0, active_count: 0, expired_count: 0,
            low_confidence_count: 0, needs_review_count: 0, extraction_passes: 0,
          },
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === MULTI-CHUNK EXTRACTION ===
    // Pre-process the text to add structural markers
    const processedText = preProcessCloudCMAText(pdfText);
    
    const MAX_CHUNK_SIZE = 45000;
    const chunks = chunkText(processedText, MAX_CHUNK_SIZE);
    let allComps: any[] = [];
    let extractionPasses = 0;
    let allSections: string[] = [];
    let extractionNotes: string[] = [];

    console.log(`PDF text length: ${pdfText.length}, processed length: ${processedText.length}, chunks: ${chunks.length}`);
    
    // Log a sample of the text for debugging
    const sampleText = pdfText.substring(0, 500);
    console.log(`Text sample (first 500 chars): ${sampleText}`);

    // Pass 1: Extract from each chunk
    for (let i = 0; i < chunks.length; i++) {
      extractionPasses++;
      const chunkLabel = chunks.length > 1 ? ` (chunk ${i + 1} of ${chunks.length})` : '';
      
      const extractionPrompt = `Extract ALL comparable properties from this CloudCMA PDF text${chunkLabel}.

IMPORTANT CONTEXT:
- This is a CloudCMA report. Properties appear as REPEATING BLOCKS, not tables.
- Each block typically starts with a street address, followed by city, MLS#, price, beds/baths/sqft, and status.
- I've added markers to help you: ---PROPERTY_BLOCK_START--- marks likely property starts, [MLS_MARKER] marks MLS numbers, [PRICE_MARKER] marks prices.
- Photo pages and image descriptions should be IGNORED.
- The text may contain garbled/encoded characters mixed with readable data - extract what you can.

SUBJECT PROPERTY (do NOT include as a comparable):
Address: ${subjectProperty?.address || 'Unknown'}

PDF TEXT${chunkLabel}:
${chunks[i]}

Remember: Extract EVERY property found. Even partial data is valuable. Do not skip any properties. Look for the markers I added and the patterns described.`;

      try {
        const result = await callAI(LOVABLE_API_KEY, EXTRACTION_SYSTEM_PROMPT, extractionPrompt);
        const comps = result.extracted_comps || [];
        console.log(`Chunk ${i + 1}: extracted ${comps.length} comps`);
        if (comps.length > 0) {
          console.log(`First comp: ${JSON.stringify(comps[0])}`);
        }
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

    // Pass 2: Retry if too few comps found - use original text with more aggressive prompt
    const highConfComps = allComps.filter((c: any) => (c.confidence ?? 1) >= 0.5);
    if (highConfComps.length < 3 && pdfText.length > 100) {
      extractionPasses++;
      console.log(`Low comp count (${highConfComps.length}), running focused retry pass...`);

      // For retry, try with original unprocessed text and a more aggressive prompt
      const retryChunk = pdfText.substring(0, MAX_CHUNK_SIZE);
      
      const retryPrompt = `CRITICAL: A previous extraction pass found only ${highConfComps.length} comparables.

This is a CloudCMA report. The text may be partially garbled from PDF extraction. 

SCAN VERY CAREFULLY for these patterns anywhere in the text:
1. ANY street address (number + street name): "123 Oak St", "45 Main Street", "100 King Road"
2. ANY MLS number pattern: "MLS" followed by digits
3. ANY dollar amounts: $XXX,XXX
4. ANY bedroom/bathroom counts: "3 bed", "2 bath", "3 BR", "2 BA"
5. ANY square footage: "1500 sq ft", "2000 SF"
6. ANY status words: "Sold", "Closed", "Active", "Pending"

Even if data is mixed with garbled text, extract what you can find.

${allComps.length > 0 ? `Previously found addresses (do NOT duplicate): ${allComps.map((c: any) => c.address).join(', ')}` : ''}

PDF TEXT:
${retryChunk}

Extract any properties you find, even with minimal data.`;

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
