import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_SYSTEM_PROMPT = `You are a real estate CMA data extraction specialist. Extract ALL comparable property listings from the provided CMA report content (it may be raw HTML from a report page, or plain text extracted from a report PDF).

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
4. Assign comp_category: "Closed"/"Sold" = sold, "Pending" = pending, "Active" = active, "Expired" = expired. Do not collapse Pending into Active or Sold.
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
      "comp_category": "sold|pending|active|expired|other",
      "confidence": number,
      "needs_review": boolean,
      "needs_review_reason": "string or null"
    }
  ],
  "extraction_summary": {
    "total_comps_found": number,
    "sold_count": number,
    "pending_count": number,
    "active_count": number,
    "expired_count": number,
    "needs_review_count": number,
    "extraction_notes": "string"
  }
}`;

const fail = (error: string, status = 200) =>
  new Response(
    JSON.stringify({
      success: false,
      error,
      extracted_comps: [],
      extraction_summary: { total_comps_found: 0 },
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );

// Rough "is this a login / access-denied shell?" check for HTML pages.
const looksLikeLoginPage = (html: string): boolean => {
  const lower = html.toLowerCase();
  const hasAuthMarkers =
    /type=["']password["']/.test(lower) ||
    /(sign in|log in|login|password required|access denied|not authorized|unauthorized)/.test(lower);
  const visibleText = lower
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return hasAuthMarkers && visibleText.length < 3000;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireStaff(req, { cors: corsHeaders });
  if (!guard.ok) return guard.response;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { url, subjectAddress } = await req.json();

    if (!url || typeof url !== "string") {
      return fail("URL is required", 400);
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return fail("Invalid URL format", 400);
    }

    console.log(`Fetching CMA URL: ${parsedUrl.href}`);

    const fetchResponse = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!fetchResponse.ok) {
      console.error(`Fetch failed: ${fetchResponse.status}`);
      return fail(
        `Failed to fetch the CMA report (HTTP ${fetchResponse.status}). The link may be expired, private, or require a login.`
      );
    }

    const contentType = (fetchResponse.headers.get("content-type") || "").toLowerCase();
    const pathname = new URL(fetchResponse.url || parsedUrl.href).pathname.toLowerCase();
    const isPdf = contentType.includes("application/pdf") || pathname.endsWith(".pdf");

    let sourceText = "";
    let sourceKind: "pdf" | "html" = isPdf ? "pdf" : "html";

    if (isPdf) {
      // CloudCMA "share PDF" links point straight at a PDF file. Extract real
      // text from the bytes instead of treating the binary as HTML.
      const bytes = new Uint8Array(await fetchResponse.arrayBuffer());
      console.log(`Fetched PDF, ${bytes.length} bytes`);
      try {
        const pdf = await getDocumentProxy(bytes);
        const { text } = await extractText(pdf, { mergePages: true });
        sourceText = (Array.isArray(text) ? text.join("\n\n") : text) || "";
      } catch (pdfErr) {
        console.error("PDF text extraction failed:", pdfErr);
        return fail(
          "This link is a PDF, but its text could not be read (it may be a scanned/image-only PDF). Download it and upload it with the Upload PDF option, or add comparables manually."
        );
      }
      console.log(`PDF text length: ${sourceText.length}`);
      if (sourceText.trim().length < 200) {
        return fail(
          "This PDF contains no readable text (likely a scanned/image-only report). Add comparables manually, or export a text-based PDF from CloudCMA."
        );
      }
    } else if (
      contentType.includes("text/html") ||
      contentType.includes("text/plain") ||
      contentType.includes("xml") ||
      contentType === ""
    ) {
      const html = await fetchResponse.text();
      console.log(`Fetched HTML length: ${html.length}`);

      if (html.length < 200) {
        return fail("The page appears to be empty or inaccessible. Check the link and try again.");
      }

      if (looksLikeLoginPage(html)) {
        return fail(
          "This link opens a sign-in page, so the report can't be read. Use a public CloudCMA share link, or download the report as a PDF and upload it."
        );
      }

      sourceText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
      sourceKind = "html";
    } else {
      return fail(
        `This link doesn't look like a CMA report (received "${contentType || "unknown content"}"). Paste the CloudCMA report or PDF link, or upload the PDF directly.`
      );
    }

    // Limit to 100k chars for AI processing
    if (sourceText.length > 100000) sourceText = sourceText.substring(0, 100000);

    const extractionPrompt = `Extract ALL comparable properties from this CMA report ${sourceKind === "pdf" ? "text (extracted from a PDF)" : "HTML page"}.

${subjectAddress ? `SUBJECT PROPERTY (do NOT include as a comparable): ${subjectAddress}` : ""}

REPORT CONTENT:
${sourceText}

Find every property listing in this content and extract all available data.`;

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
        return fail("Rate limit exceeded. Please try again in a moment.", 429);
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
      return fail("Unable to automatically extract comparables from this link. You can still add comparables manually.");
    }

    const comps = parsed.extracted_comps || [];

    if (comps.length === 0) {
      return fail(
        sourceKind === "pdf"
          ? "No comparable properties were found in this PDF report. You can add comparables manually."
          : "No comparable properties were found at this link. CloudCMA share pages often load their data after the page opens — download the report as a PDF and upload it instead."
      );
    }

    const computedSummary = {
      total_comps_found: comps.length,
      sold_count: comps.filter((c: any) => c.comp_category === "sold").length,
      pending_count: comps.filter((c: any) => c.comp_category === "pending").length,
      active_count: comps.filter((c: any) => c.comp_category === "active").length,
      expired_count: comps.filter((c: any) => c.comp_category === "expired").length,
      needs_review_count: comps.filter((c: any) => c.needs_review).length,
    };
    const summary = { ...computedSummary, ...(parsed.extraction_summary || {}), ...computedSummary };

    console.log(`Extracted ${comps.length} comps from ${sourceKind} link`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_comps: comps,
        extraction_summary: {
          ...summary,
          source_type: "link",
          source_format: sourceKind,
          source_url: parsedUrl.href,
          html_length: sourceText.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("CMA link scrape error:", e);
    return fail(`Unable to automatically extract comparables from this link. ${msg}`);
  }
});
