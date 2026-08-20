# Module 8 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 8 rows are touched.

## Targets (confirmed by query)

- Junior module `f93aba12-3f1f-4d35-82be-fa4ae5af2d0a` — "Negotiation Fundamentals"
- Associate module `5b349627-31ad-429f-a569-b68ba1405875` — "Negotiation Scriptbook"

Both currently hold 5 placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

## Target end state

Junior — 15 slides:

```text
1-13  content             (3 existing rows reused for 1-3, 10 new rows inserted for 4-13)
14    practice_assignment (existing row, renumbered 4 -> 14)
15    knowledge_check     (existing row, renumbered 5 -> 15)
```

Associate — 13 slides:

```text
1-11  content             (3 existing rows reused for 1-3, 8 new rows inserted for 4-11)
12    practice_assignment (existing row, renumbered 4 -> 12)
13    knowledge_check     (existing row, renumbered 5 -> 13)
```

## Method

One migration, every statement scoped by `module_id` to one of the two ids:

1. Park each module's practice_assignment and knowledge_check rows at slide_number 106 / 107 so the unique `(module_id, slide_number)` constraint never collides mid-update.
2. Update the 3 existing content rows in place (same ids) with the new titles and bodies.
3. Insert the additional content rows (10 for Junior, 8 for Associate).
4. Move the parked rows to their final numbers and fill their bodies with the supplied practice assignment and knowledge check text.

No rows deleted, no rows outside these two module_ids referenced.

## Content applied

Junior slides 1-13: Learning Objectives; Core Negotiation Principles; Negotiating a Single Offer; Multiple-Offer Situations; Repair Negotiations & Whose Interests You Represent; Scripts — Pricing & Listing, Multiple-Offer & Competitive; Scripts — Financing & Conditions, Repairs & Post-Inspection; Scripts — Closing & Timeline; Deal Saver — The Condo Special Assessment; Deal Saver — The Assisted Living Deadline; Deal Saver — The Divorce; Deal Saver — The Undisclosed Basement Flood; Core Principles & Common Mistakes. Then the 4-step practice assignment and 8-question knowledge check.

Associate slides 1-11: How to Use This Book; Pricing & Listing Scripts; Multiple-Offer & Competitive Situation Scripts; Financing & Conditions Scripts; Repairs & Post-Inspection Scripts; Closing & Timeline Scripts; Deal Saver — Condo Special Assessment; Deal Saver — Assisted Living Deadline; Deal Saver — The Divorce; Deal Saver — Undisclosed Basement Flood; Core Principles (Deal Saver Appendix). Then the 3-step practice assignment and 8-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
