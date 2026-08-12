# Module 3 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no code changes. Only the two Module 3 rows are touched.

## Targets (confirmed by query)

- Junior module `73637980-8a53-42f1-8190-25bf5f14254b` — "CRM & Lead Follow-Up"
- Associate module `5dd033f8-0f66-4ed9-8caa-57ce57089372` — "CRM & Lead Follow-Up"

Both currently hold 5 empty placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check).

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

Junior slides 1-8: Learning Objectives; From Lead Source to First Contact; The Lead Day Pond; Tags — What They're For (and Not For); Working Each List; Moving Leads Between Lists; What Your Mentor Checks; Prospecting & Lead Generation — Scripts & Roleplay. Then the 6-step practice assignment and 8-question knowledge check.

Associate slides 1-4: Learning Objectives; Quick-Reference — Our Tag Categories; Quick-Reference — Our Smart Lists; What's Actually New Here. Then the 4-step practice assignment and 4-question knowledge check.

Bodies are plain text with line breaks and bullet dashes, matching what the slide viewer renders today (`whitespace-pre-wrap`). Knowledge-check answers supplied in parentheses are kept inline as written.

## Verification

After writing: re-query both modules and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup for every other module confirming counts and body lengths are unchanged.
