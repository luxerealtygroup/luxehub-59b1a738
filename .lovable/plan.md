# Module 11 — Content Population (unified, one row)

Content-only update to `launchpad_slides` for Module 11 (`7fb01c19-0c1b-4dfc-8c4f-c2d84fd0d37c`, unified). No schema changes, no new tables, no other module touched.

## Current state (verified)
Module 11 has 5 slides, all empty bodies:
1. Overview (content)
2. Key Concepts (content)
3. Putting It Into Practice (content)
4. Practice Assignment (practice_assignment)
5. Knowledge Check (knowledge_check)

## Target state
11 slides: 9 content slides (1–9) + practice_assignment (10) + knowledge_check (11).

## Approach (same renumbering pattern as prior modules)
1. Park the existing PA/KC rows at temporary high slide numbers (e.g. 90, 91) to clear the unique constraint.
2. Update the 3 existing content rows in place with the new slides 1–3 titles/bodies.
3. Insert 6 new content rows for slides 4–9.
4. Renumber the parked PA row to slide 10 and KC row to slide 11, and write their new bodies.

Slide titles:
1. Learning Objectives
2. The Business Planning Hub: Performance Reality
3. Reflection & Mindset, and Quarter Strategy & Goals
4. Action Plan Tab & The Goals Page
5. Weekly Coaching: The Accountability Engine
6. Reports Hub: Six Views for Different Questions
7. Activities & Why This Approach Works
8. Trust the Data, But Verify & Common Mistakes
9. What Happens at Day 90
10. Practice Assignment
11. Knowledge Check

All body text is used verbatim as supplied.

## Verification after the write
- Re-query Module 11: slide_number, slide_type, title, body length for all 11 rows.
- Re-query per-module slide counts and total body length for Modules 1–10 and 12 to confirm nothing else changed.
