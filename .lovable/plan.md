# Module 6 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 6 rows are touched.

## Targets (confirmed by query)

- Junior module `31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289` — "Contracts & Paperwork"
- Associate module `bb92a384-3460-43c2-bb0d-dd0e7fbb02ff` — "Contracts & Paperwork"

Both currently hold 5 placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

## Target end state

Junior — 10 slides:

```text
1-8   content             (3 existing rows reused for 1-3, 5 new rows inserted for 4-8)
9     practice_assignment (existing row, renumbered 4 -> 9)
10    knowledge_check     (existing row, renumbered 5 -> 10)
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
3. Insert the additional content rows (5 for Junior, 1 for Associate).
4. Move the parked rows to their final numbers and fill their bodies with the supplied practice assignment and knowledge check text.

No rows deleted, no rows outside these two module_ids referenced.

## Content applied

Junior slides 1-8: Learning Objectives; The Core Forms Ecosystem; Anatomy of the APS, Part 1; Anatomy of the APS, Part 2; Conditions — Drafting, Waiving, and Deadlines; When a Deal Changes or Falls Through; Where Everything Gets Signed and Filed; Common New-Agent Mistakes. Then the 5-step practice assignment and 6-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Where Things Live; What's Actually New Here (Forms & Tools); What's Actually New Here (Compliance & Process). Then the 4-step practice assignment and 3-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
