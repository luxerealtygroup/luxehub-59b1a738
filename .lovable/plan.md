# Module 10 Content — Unified Reference (Vendor & Preferred Partner Contact List)

Content-only update to `launchpad_slides`. No schema changes, no new tables, no renumbering. The module has no practice_assignment or knowledge_check slides, by design. Only the single Module 10 row's 3 content slides are touched.

## Target (confirmed by query)

- Module 10 unified — `767ffb05-c72d-4a3f-9284-50841f3a5bfd` — "Vendor & Preferred Partner Contact List" (kind: reference, track: unified)
- Currently 3 content slides with placeholder titles (Overview / Key Concepts / Putting It Into Practice), all bodies empty (length 0).

## Target end state

Slide count stays at 3 — same 3 rows, same ids, same `slide_number`. Only `title` and `body` change:

```text
1  content  Photography & Cleaning
2  content  Home Inspectors & Staging
3  content  Moving, Junk Removal & Legal
```

## Method

One migration with three `UPDATE` statements, each scoped by `slide_id` (the existing row ids) and `module_id`:

1. `UPDATE ... WHERE module_id = '767ffb05-...' AND slide_number = 1` → title "Photography & Cleaning", body = supplied text.
2. `UPDATE ... WHERE module_id = '767ffb05-...' AND slide_number = 2` → title "Home Inspectors & Staging", body = supplied text.
3. `UPDATE ... WHERE module_id = '767ffb05-...' AND slide_number = 3` → title "Moving, Junk Removal & Legal", body = supplied text.

No inserts, no deletes, no rows outside this module_id referenced. Bodies are plain text with line breaks, matching the slide viewer's `whitespace-pre-wrap` rendering.

## Content applied

- **Slide 1 — Photography & Cleaning:** Preferred-vendor-is-client's-choice framing; OAKHAUS disclosure cross-reference to Module 2; JM Media (Josh) 905-745-1335; Wayzie Media 289-302-0388; Lisa (Niagara); Tatiana 519-880-4580; Dash Cleaning (Pam Milne) 437-577-5658; Kasey McDonough 226-791-8882.
- **Slide 2 — Home Inspectors & Staging:** Chad Hussey (Pillar to Post) 519-580-1409; HomeWorks 905-630-8775; Regional Property Inspections (Peter Blackwell) 519-241-4556; Baseline (Rod) 519-656-2402; Heeley (Mike) 519-835-0622. Staging: Elle Cee Staging (Lilly) 519-722-5481; Staged with Kare (Karen) 226-505-8377; One Stop Home Staging (Shawna) 519-410-0098.
- **Slide 3 — Moving, Junk Removal & Legal:** Victor 519-221-0201; Ricky's Moving 519-502-4932; BG Moving 226-368-1676. Lawyers: Lennox and Penny (Chris Baillargeon) 519-653-5747; Travers Law 1-877-744-2281; Hussein Law (Victor) 519-744-8585; Rabideau Law 1-888-820-1321.

## Verification

After writing: re-query Module 10 and paste the raw rows (slide_number, slide_type, title, body length) ordered by slide_number, plus a per-module rollup confirming every other module's slide count and total body length is unchanged.
