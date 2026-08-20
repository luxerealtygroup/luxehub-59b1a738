# Module 9 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 9 rows are touched.

## Targets (confirmed by query)

- Junior module `c8243451-ccf7-42ce-ac22-0cf7379ad149` — "Marketing & Branding Standards"
- Associate module `7fec9d1b-2cc9-484e-9e28-bff22c7a22b0` — "Marketing & Branding Standards"

Both currently hold 5 placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

## Target end state

Junior — 8 slides:

```text
1-6   content             (3 existing rows reused for 1-3, 3 new rows inserted for 4-6)
7     practice_assignment (existing row, renumbered 4 -> 7)
8     knowledge_check     (existing row, renumbered 5 -> 8)
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
3. Insert the additional content rows (3 for Junior, 1 for Associate).
4. Move the parked rows to their final numbers and fill their bodies with the supplied practice assignment and knowledge check text.

No rows deleted, no rows outside these two module_ids referenced.

## Content applied

Junior slides 1-6: Learning Objectives; Our Brand Identity; RECO Advertising Compliance — This Applies to Everything You Post; The LUXE Marketing System & AI Personal Brand Tool; Digital & Social Media, Print & Signage; Common Branding/Advertising Mistakes. Then the 5-step practice assignment and 6-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Our Brand; What's Actually Worth Double-Checking (Even With Experience); Quick-Reference — The LUXE Marketing System. Then the 3-step practice assignment and 4-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
