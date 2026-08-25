# CMA Studio: generalized adjustments, weighted market context, $/sqft cross-check, scenarios

## Open item before building

Your message arrived truncated — it starts mid-sentence at "— not just basement finish", so **item 1 and the opening of item 2 are missing**. This plan covers items 2–5 as written plus the integration work. Paste the missing item 1 (and the start of 2) and I'll fold it in.

## What changes for the agent

1. **All feature adjustments in one framework** — instead of only basement finish, the analysis returns a structured list of every material feature difference between the subject and the comps (basement finish stays as one entry alongside things like above-grade size, age/condition, garage, lot, and finish level). Each entry says which direction it moves value and by roughly how much.
2. **Regional market context becomes a required, weighted input** — when the web-sourced board statistics come back, they must shape the market narrative *and* the pricing band, not just sit in the background as framing. When they're genuinely unavailable, the report says nothing about them (unchanged behaviour).
3. **A $/sqft sanity check** — a new block that takes total finished area (above grade + finished basement) on the 2–3 most similar sold comps and states the implied value range, then says plainly whether it confirms or challenges the adjustment-based recommended price.
4. **Three scenarios** — conservative / most probable / optimistic, each with a price and a one-line rationale, mirroring the three-scenario framework. The existing low/recommended/high fields stay exactly as they are, so nothing in today's UI or client-facing document breaks.
5. **New audit-view sections** — "Feature Adjustments" and "Price per Sq Ft Cross-Check" cards appear alongside the existing Adjustment Observations card, plus the three scenarios next to the pricing band.

## Technical approach

### `supabase/functions/cma-analyze/index.ts`

- Extend the JSON contract in `ANALYSIS_SYSTEM_PROMPT` with:
  - `feature_adjustments: [{ feature, subject_value, comp_basis, direction: "up|down|neutral", estimated_impact, basis, confidence }]` — basement finish must appear here whenever the segmentation block has data for both segments, citing both $/sqft figures (the existing `adjustment_observations` array is kept and continues to be populated, so current UI and templates are unaffected).
  - `price_per_sqft_cross_check: { comps_used: [{address, total_finished_sqft, sold_price, price_per_sqft}], implied_low, implied_high, subject_total_finished_sqft, verdict: "confirms|challenges|inconclusive", commentary }`.
  - `valuation_scenarios: { conservative: {price, rationale}, most_probable: {price, rationale}, optimistic: {price, rationale} }` with `most_probable.price` required to equal `pricing_band_recommended`.
- Rewrite the "MARKET STATS SOURCING RULES" clause on web context: promote it from SUPPLEMENTARY to a **required weighted input** when present — it must be cited in `market_narrative` with its reporting month/source, and must be reflected in where the recommended price sits inside the band (with the divergence called out when the local comp set disagrees with the regional trend). Keep the existing rule that agent-provided board stats override, and keep the "omit web framing entirely when unavailable" rule.
- Relabel the block in `buildMarketStatsBlock` accordingly, and add a computed `TOTAL FINISHED AREA` helper block (`computeTotalFinishedAreaStats`) that feeds the cross-check with real numbers rather than leaving the model to do arithmetic: subject total finished sqft plus per-comp total finished sqft and $/sqft for sold comps that have the data.
- `finalizeAnalysis`: keep `stripBannedBranding` / `stripUnsupportedPendingClaims` / `normalizeRecommendedPrice` unchanged (they already walk the whole object, so new nested fields are covered automatically), and add normalization that forces `valuation_scenarios.most_probable.price` to the canonical `recommended_price`, orders conservative ≤ most_probable ≤ optimistic, and defaults the three new fields to `[]` / `null` so the failure path and the no-comps path stay shape-stable. Same defaults added to the `analysis = { ... }` fallback object.

### `supabase/functions/generate-cma/index.ts`

- Pass the finalized analysis block (recommended price, feature adjustments, cross-check, scenarios, market classification, web context) into the prompt as **authoritative** and instruct the template to consume it rather than re-derive pricing, so the client-facing document can no longer disagree with the audit view.
- Import/duplicate `stripBannedBranding`, `normalizeRecommendedPrice` and `stripUnsupportedPendingClaims` and apply them to the generated HTML before returning it (currently they run only in `cma-analyze`). Shared copies go in `supabase/functions/_shared/cmaGuardrails.ts` and both functions import from there — one implementation, no drift.

### Database + types

- Migration adding to `public.cma_reports`: `feature_adjustments jsonb default '[]'`, `price_per_sqft_cross_check jsonb`, `valuation_scenarios jsonb` (nullable, existing rows unaffected; no grant/RLS change needed since the table already has both).
- `CMAInputForm.tsx`: persist the three new fields on save/re-analyze alongside the existing analysis fields.
- `CMAAuditView.tsx`: extend the report interface and the row mapping with the new fields (defensive defaults, same pattern as `adjustment_observations`), then render:
  - a **Feature Adjustments** table card directly above the existing Adjustment Observations card,
  - a **Price per Sq Ft Cross-Check** card showing comps used, implied range, and a confirms/challenges badge,
  - the three scenarios as a compact row inside the existing pricing-band section.
- Everything new renders only when present, so existing saved reports display exactly as they do today.

## Verification

- Run a real `cma-analyze` call against an existing report's comp set and read the response to confirm the new fields come back populated and `most_probable.price === pricing_band_recommended`.
- Run `generate-cma` on the same report and confirm the HTML uses the audit view's recommended price and contains no banned branding.
- Load an older report in the audit view to confirm no layout or runtime errors when the new fields are absent.
