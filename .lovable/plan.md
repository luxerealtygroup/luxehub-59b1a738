# Module 1 Content — Junior & Associate

Content-only data update to `launchpad_slides`. No schema changes, no new tables, no code changes. Only the two Module 1 modules are touched.

## Rows targeted

Junior module `318bb0fb-7604-4298-a9a0-d93665de6f0b` and Associate module `427b567f-4f41-498c-9ffe-18de0f12868c` — both currently hold 5 empty placeholder slides (3 content, 1 practice_assignment, 1 knowledge_check). Every statement is scoped by `module_id` to one of these two ids, so no other module's rows can be reached.

## How slide numbers get reassigned

The existing practice_assignment and knowledge_check rows are kept (same ids, same `slide_type`) and are renumbered to sit last. Content slides are grown to the real counts.

Junior — 11 slides total:

```text
1-9   content            (3 existing rows reused for 1-3, 6 new rows added for 4-9)
10    practice_assignment (existing row d7d794ef, renumbered 4 -> 10)
11    knowledge_check     (existing row 9ff2bf36, renumbered 5 -> 11)
```

Associate — 6 slides total:

```text
1-4   content            (3 existing rows reused for 1-3, 1 new row added for 4)
5     practice_assignment (existing row 78c59d1a, stays at 4 -> renumbered 5)
6     knowledge_check     (existing row 850e42df, renumbered 5 -> 6)
```

Ordering is applied in a single transaction, moving the assignment/check rows out of the way first so the `(module_id, slide_number)` uniqueness never collides mid-update.

## Content applied

Junior content slides 1-9: Learning Objectives; Your Tech Stack, End to End; FUB Smart Lists (Priority Queues); Smart Lists (Nurture Cadence) & the Lead Day Pond; AI Lead Re-Engagement; LUXEhub — Where You Submit Paperwork; AuthentiSign & AI Tenant Screening; AI Market Analysis & Pricing Package; AI Personal Brand — Social Media Audit & Content Plan. Then the 5-step practice assignment and the 6-question knowledge check, exactly as supplied.

Associate content slides 1-4: Learning Objectives; Quick-Reference — Our Tech Stack; What's Actually New Here (Systems); What's Actually New Here (AI Tools). Then the 3-step practice assignment and the 3-question knowledge check.

Bodies are written as plain text with line breaks and bullet dashes, which is what the slide viewer renders today (`whitespace-pre-wrap`). Answers included in the supplied knowledge-check text are kept inline in parentheses as written.

## Why the UI needs no change

The viewer already derives its total from the fetched slide rows, so 6- and 11-slide modules render, navigate, and complete correctly without any edit.

## Verification

After the update I will re-query both modules and paste the raw rows — slide_number, slide_type, title, body length — so you can confirm counts and ordering, plus a count check that no other module's slides changed.
