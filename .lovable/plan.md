# Module 5 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 5 rows are touched.

## Targets (confirmed by query)

- Junior module `2164bb80-0599-4822-a678-dc3b75e7b67c` — "Listing/Seller Consultation"
- Associate module `50d467ed-32eb-4f79-a22d-0dc732ee26c4` — "Listing/Seller Consultation"

Both currently hold 5 placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

## Target end state

Junior — 14 slides:

```text
1-12  content             (3 existing rows reused for 1-3, 9 new rows inserted for 4-12)
13    practice_assignment (existing row, renumbered 4 -> 13)
14    knowledge_check     (existing row, renumbered 5 -> 14)
```

Associate — 6 slides:

```text
1-4   content             (3 existing rows reused for 1-3, 1 new row inserted for 4)
5     practice_assignment (existing row, renumbered 4 -> 5)
6     knowledge_check     (existing row, renumbered 5 -> 6)
```

## Method

One migration, every statement scoped by `module_id` to one of the two ids:

1. Park each module's practice_assignment and knowledge_check rows at slide_number 106 / 107 so the unique `(module_id, slide_number)` constraint never collides mid-update.
2. Update the 3 existing content rows in place (same ids) with the new titles and bodies.
3. Insert the additional content rows (9 for Junior, 1 for Associate).
4. Move the parked rows to their final numbers and fill their bodies with the supplied practice assignment and knowledge check text.

No rows deleted, no rows outside these two module_ids referenced.

## Content applied

Junior slides 1-12: Learning Objectives; Before the Consultation — LUXEhub Listings Resources; Our Strategic Approach — Seven Steps; Mission, Values & First Impressions; Factors That Influence Value & Establishing Price; The Cost of Overpricing; Getting Market Ready; Marketing — Standing Out; Offers & Negotiations; The Offer Process in Ontario — Full Timeline; If Home Inspection Issues Come Up; Closing Day Checklist & What Sellers Will Sign. Then the 4-step practice assignment and 7-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Our Consultation Structure; What's Actually New (Proprietary Tools); What's Actually New (Paperwork & Overpricing). Then the 3-step practice assignment and 4-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
