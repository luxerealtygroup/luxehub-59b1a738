# Module 4 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 4 rows are touched.

## Targets (confirmed by query)

- Junior module `a82ca353-adbf-4d47-8d22-533188875a69` — "Buyer Consultation to Close"
- Associate module `ae86f9ff-75de-47e8-bd2d-5d544d0d330b` — "Buyer Consultation to Close"

Both currently hold 5 empty placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

## Target end state

Junior — 13 slides:

```text
1-11  content             (3 existing rows reused for 1-3, 8 new rows inserted for 4-11)
12    practice_assignment (existing row, renumbered 4 -> 12)
13    knowledge_check     (existing row, renumbered 5 -> 13)
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
3. Insert the additional content rows (8 for Junior, 1 for Associate).
4. Move the parked rows to their final numbers and fill their bodies with the supplied practice assignment and knowledge check text.

No rows deleted, no rows outside these two module_ids referenced.

## Content applied

Junior slides 1-11: Learning Objectives; Before the Consultation — The Buyer Representation Agreement; Our Mission & Buyer Analysis; Market Conditions; Mortgage Pre-Approval — Why It's Important; Finding a Realtor — Our Value to You; Finding Your Home — The Research Phase; Selecting and Viewing Homes; The Paperwork — Contracts & Conditions; Communication, Transparency & Moving Day; Next Steps — Let's Get Started. Then the 4-step practice assignment and 8-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Our Consultation Order; What's Actually New Here (Team & Paperwork); What's Actually New Here (AI & Search Portal). Then the 3-step practice assignment and 3-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
