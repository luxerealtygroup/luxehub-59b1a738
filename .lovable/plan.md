# Module 2 Content Update — Human Rights & Legal Basics

Content-only. One module. No schema changes.

## Target (confirmed by query)

Module: `9e227428-8cd8-4ded-b568-1a833d1327ad` — module_number 2, track `unified`, title "Human Rights & Legal Basics". It is the only module 2 row.

Current 5 slides, all empty bodies:

| slide_number | slide_type | title |
|---|---|---|
| 1 | content | Overview |
| 2 | content | Key Concepts |
| 3 | content | Putting It Into Practice |
| 4 | practice_assignment | Practice Assignment |
| 5 | knowledge_check | Knowledge Check |

## Target end state (7 slides)

| slide_number | slide_type | title |
|---|---|---|
| 1 | content | Learning Objectives |
| 2 | content | Ontario Human Rights Code — Housing |
| 3 | content | TRESA & RECO |
| 4 | content | FINTRAC / Anti-Money Laundering |
| 5 | content | Financial Benefit & Referral Disclosure |
| 6 | practice_assignment | Practice Assignment |
| 7 | knowledge_check | Knowledge Check |

## How it will be done

Single migration, all statements scoped by `module_id = '9e227428-...'` so no other module can be touched:

1. Park the existing practice_assignment and knowledge_check rows at slide_number 106 / 107 to avoid colliding with the unique `(module_id, slide_number)` constraint.
2. Update the 3 existing content rows in place (same ids) to slides 1-3 with the new titles and bodies.
3. Insert 2 new content rows as slides 4 and 5.
4. Move the parked rows down to 6 and 7 (same ids, same slide_type) and fill their bodies with the supplied practice assignment and knowledge check text.

No renumbering logic touches any row outside this module_id; no rows are deleted.

## Verification after writing

- Re-query all rows for this module: slide_number, slide_type, title, body length, ordered by slide_number — pasted raw.
- Re-run the per-module count/body-length rollup for every other module to confirm they are unchanged (Module 1 populated as before; all others 3 content + 1 practice_assignment + 1 knowledge_check with empty bodies, and Module 10 at 3 content slides).

## Note

Slide 1 opens with the "factual information, not legal advice — confirm anything ambiguous with your mentor or broker" framing, as supplied.
