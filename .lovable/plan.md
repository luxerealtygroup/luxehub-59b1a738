# Module 7 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 7 rows are touched.

## Targets (confirmed by query)

- Junior module `edfa2b7b-65e5-45ce-9967-3b939e6beaa5`
- Associate module `d6d22271-d7ad-4391-946e-19f8ae573845`

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

Junior slides 1-6: Learning Objectives; The TC's Role & The Agent's Role; Handoff Points Across the Deal Timeline; Communication Protocol (Our Real Workflow); Common Friction Points (and How to Avoid Them); What Good Coordination Looks Like. Then the 4-step practice assignment and 7-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Handoff Points; What's Actually New Here (Asana Access); What's Actually New Here (Our Real Workflow). Then the 2-step practice assignment and 4-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
