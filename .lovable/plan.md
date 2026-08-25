# CMA Studio: one source of truth + upgraded analysis methodology

## Decision confirmed

`cma-analyze` becomes the **single source of truth**. `generate-cma` stops deriving its own pricing and consumes the audit numbers as fixed inputs, so the client-facing report can never disagree with the audit view.

## What changes for the agent

1. **Client report always matches the audit view** — the recommended price, band, grade, narrative, adjustments and risk flags in the client document are the exact values shown in the audit. `generate-cma` becomes a writer/formatter, not a second appraiser.
2. **Smarter analysis engine** — the analysis pass moves from Gemini Flash to Claude Sonnet (comp extraction from PDFs stays on Gemini Flash, which is doing that job well and cheaply).
3. **Explicit dollar adjustments for every material feature** — pool, garage type, lot size, renovations, and basement finish each get a stated low–high dollar adjustment with a rationale. A pool is *never* silently assumed to be priced in, and a single garage where doubles are the norm is called out as a structural liability.
4. **Regional market context becomes a weighted input** — when the board statistics come back from the web lookup they must shape both the narrative and where the price sits in the band, not just appear as background colour.
5. **A $/sqft sanity check** — implied value range from total finished area on the 2–3 most similar sold comps, with a plain confirms/challenges verdict against the recommended price.
6. **Three scenarios** — conservative / most probable / optimistic, alongside the existing low/recommended/high band, which is kept untouched for backward compatibility.

## Technical approach

### `supabase/functions/cma-analyze/index.ts`

- **Model split**: `callAI` keeps `google/gemini-2.5-flash` as its default for the extraction passes; the analysis pass is called explicitly with a Claude Sonnet id on the Lovable AI Gateway (verified against the gateway model catalog before wiring, and applied to all three analysis call sites: reviewed-comps, no-PDF, and post-extraction). Existing `RATE_LIMIT` / `CREDITS_EXHAUSTED` handling is unchanged.
- **Prompt contract additions** to `ANALYSIS_SYSTEM_PROMPT`:
  - `"feature_adjustments": [{ feature, adjustment_low: number, adjustment_high: number, rationale: string }]` — required entries, when the data supports them, for: pool (always stated explicitly, never assumed priced into comps), garage type (single vs double, treated as a structural liability where doubles are the norm for the comp set), lot size, renovations/finish level, and basement finish (the existing segmentation folded in as one entry citing both $/sqft figures). `adjustment_observations` is still produced so today's UI and templates keep working.
  - `"price_per_sqft_cross_check": { subject_total_finished_sqft, comps_used: [{ address, total_finished_sqft, sold_price, price_per_sqft }], implied_low, implied_high, verdict: "confirms|challenges|inconclusive", commentary }` using total finished area = above grade + finished basement.
  - `"valuation_scenarios": { conservative: {price, rationale}, most_probable: {price, rationale}, optimistic: {price, rationale} }`, with `most_probable.price` required to equal `pricing_band_recommended`.
- **Web context promoted**: rewrite the sourcing rules so "GENERAL WEB MARKET CONTEXT" becomes a *required, weighted input* when present — cited with its reporting month and source in `market_narrative`, and reflected in where the recommended price sits inside the band, with any divergence between the regional trend and this comp set called out. Agent-provided board stats still override; the "omit web framing entirely when unavailable" rule stays.
- **New helper** `computeTotalFinishedAreaStats(comps, subjectProperty)` computes subject and per-comp total finished sqft and $/sqft server-side, and is added to `buildMarketStatsBlock` so the cross-check rests on real arithmetic rather than model math. The basement segmentation block is relabelled as one input to the broader adjustment framework.
- **`finalizeAnalysis`** keeps `stripBannedBranding`, `stripUnsupportedPendingClaims` and `normalizeRecommendedPrice` as-is (they walk the whole object, so nested new fields are covered), plus: force `valuation_scenarios.most_probable.price` to the canonical `recommended_price`, order conservative ≤ most_probable ≤ optimistic, and default the three new fields (`[]` / `null`) so the analysis-failure fallback object and the no-comps path stay shape-stable.

### `supabase/functions/generate-cma/index.ts`

- Rewrite `SYSTEM_PROMPT` so the supplied analysis block is **authoritative and non-negotiable**: `pricing_band_low/recommended/high`, `cma_grade`, `pricing_confidence`, `strategy_recommendation`, `market_narrative`, `risk_flags`, `weak_comp_alerts`, `adjustment_observations`, `feature_adjustments`, `price_per_sqft_cross_check`, `valuation_scenarios` and `market_classification` are copied/paraphrased, never recomputed, re-rounded, or overridden. Any dollar figure in the document must be one of the supplied values.
- Pass the stored analysis fields explicitly in the user prompt (from the saved report row) instead of leaving the model to infer pricing from raw comps.
- Apply the branding guardrails to `generate-cma`'s output: move `stripBannedBranding`, `normalizeRecommendedPrice` and `stripUnsupportedPendingClaims` into `supabase/functions/_shared/cmaGuardrails.ts`, import them in both functions (one implementation, no drift), and run them over the generated HTML before returning it.

### Database + types + UI

- Migration adding to `public.cma_reports`: `feature_adjustments jsonb default '[]'::jsonb`, `price_per_sqft_cross_check jsonb`, `valuation_scenarios jsonb` — all nullable/defaulted, existing rows unaffected; the table already has grants and RLS so no access changes.
- `CMAInputForm.tsx`: persist the three new fields on save and on re-analyze, alongside the existing analysis fields.
- `CMAAuditView.tsx`: extend the report interface and row mapping with defensive defaults (same pattern as `adjustment_observations`), then render:
  - a **Feature Adjustments** table card (feature, $ range, rationale) directly above the existing Adjustment Observations card,
  - a **Price per Sq Ft Cross-Check** card showing the comps used, implied range, and a confirms/challenges badge,
  - the three **valuation scenarios** as a compact row inside the existing pricing-band section.
- All new UI renders only when the data is present, so previously saved reports look exactly as they do today.

## Verification

- Run `cma-analyze` against an existing report's comp set and read the response: new fields populated, `most_probable.price === pricing_band_recommended`, scenarios ordered.
- Run `generate-cma` on the same report and confirm the HTML's recommended price, grade and band match the audit view exactly, and that no banned branding survives.
- Open an older report in the audit view to confirm no runtime or layout errors when the new fields are absent.

## Note

Your earlier message arrived truncated (it began mid-sentence), so if there was an item beyond these five, send it and I'll fold it in.
