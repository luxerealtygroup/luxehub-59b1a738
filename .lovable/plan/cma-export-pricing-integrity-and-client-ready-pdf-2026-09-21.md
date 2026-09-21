# CMA export: pricing integrity and client-ready PDF

## Diagnosis so far

- The saved Cheltonwood comp records do **not** all have the same price. The database has distinct sold prices: $670,000, $740,000, $745,000, $752,000, $767,000, $878,000 and $879,900.
- The main overwrite bug is in the report guardrail layer: it normalizes any dollar amount within 5% of the recommended price to the recommended price. That was meant to stop prose drift, but it is also touching comp cards, Low/High values, scenarios, and adjustment ranges.
- The saved report also contains some bad/weak source data that the export must not amplify: missing above-grade/basement fields on comps, several generic 1,100 sq ft values, the `market_classification` object, and narrative strings with `fi eld` / repeated area suffixes.

## Part A — data and valuation fixes

1. **Stop price overwrites**
   - Restrict recommended-price normalization to narrative prose only, never structured comp prices, pricing bands, valuation scenarios, adjustment ranges, or generated report markup.
   - Remove the final HTML-wide price normalization from `generate-cma`; keep branding and unsupported-pending cleanup safe.

2. **Deterministic pricing band**
   - Add shared valuation helpers that calculate adjusted comp values from sold comp price + net feature adjustments.
   - Set Low = 25th percentile, Recommended = median unless an approved/agent override exists, High = 75th percentile.
   - Apply the report’s net adjustment range once to the percentile values.
   - Set valuation scenarios directly from Low / Recommended / High.
   - Show when the opinion value is an override.

3. **Comp price anomaly guard**
   - Detect when more than half of sold comps have the exact same sold price.
   - Show “Possible data error — verify comp prices” in the audit/client report screens.
   - Block PDF export/send unless the agent explicitly confirms the comp prices.
   - Store that confirmation additively on the CMA row.

4. **Square footage fields and labels**
   - Preserve separate comp `ag_sqft` and `bg_sqft` through extraction, review, save, export, and PDF input.
   - Never print `0 sq ft`; print “Sq ft not reported”.
   - Treat repeated default-looking 1,100 sq ft values as reported values only if present, not as a fallback default.

5. **Price-per-sq-ft cross-check**
   - Recompute the cross-check using above-grade-to-above-grade only.
   - Exclude comps without usable above-grade square footage.
   - Display how many comps were used and how many were omitted.

6. **Text/data cleanup**
   - Render object fields by label/value, never as `[object Object]`.
   - Reuse the same market stat source everywhere it appears.
   - Format negative ranges, hide $0–$0 adjustments, add thousands separators, humanize enum labels, normalize addresses, repair ligature spacing, remove repeated “— Grange Road”, and hide the Launch column unless real launch content exists.

## Part B — PDF/export layout

1. Replace the current long editorial HTML layout with a compact print-first layout targeting 10–12 letter pages.
2. Use LUXE branding, consistent margins, print-safe page breaks, and a footer on every page with brand/agent/page number.
3. Build the requested sections:
   - Cover page with logo, cover photo if available, address, client, agent contact, date.
   - Property Snapshot on one page with full subject details and photo.
   - Comparable Properties with a side-by-side comparison table, then compact two-per-row comp cards.
   - Value Drivers / Strategy as full-width blocks or a simple adjustment table, no skinny overflow columns.
   - Pricing Analysis with Low / Recommended / High and $/sq-ft cross-check.
   - Final disclaimer and agent contact block.

## Database changes

- Additive only: add a nullable confirmation field to `cma_reports` for comp-price anomaly acknowledgement.
- No RLS policy changes.
- No drops or renames.

## Verification

- Regenerate the exact Cheltonwood report in preview.
- Confirm comp prices differ and come from each comp row.
- Confirm Low < Recommended < High and scenarios differ unless the adjusted comps truly match.
- Search the generated output for banned strings: `0 sq ft`, `[object Object]`, `$0–$0`, `--`, `MOST_PROBABLE`, `fi eld`.
- Print/export to PDF and visually inspect rendered pages: 12 pages or fewer, no page mostly blank, no orphan headings.
- Keep everything on preview; do not publish.
