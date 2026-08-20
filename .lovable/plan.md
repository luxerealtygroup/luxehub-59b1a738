# Plan: Populate Module 12 Content (Agent Safety & Personal Security)

## Scope
Content-only update to `launchpad_slides` for Module 12's single unified module row. No schema changes, no new tables, nothing structural. No other module's rows will be touched.

## Confirmed current state
- Module 12 row: `id = 5b61cb4b-598e-4db7-b5ec-c23ca60a4c53`, `track = unified`, `title = "Agent Safety & Personal Security"`.
- Existing 5 placeholder slides (all `body_len = 0`):
  - slide 1 — content — "Overview"
  - slide 2 — content — "Key Concepts"
  - slide 3 — content — "Putting It Into Practice"
  - slide 4 — practice_assignment — "Practice Assignment"
  - slide 5 — knowledge_check — "Knowledge Check"

## Target end state
7 slides total for Module 12:
- slides 1–5: content
- slide 6: practice_assignment
- slide 7: knowledge_check

## Renumbering strategy (same pattern as prior modules)
1. UPDATE the 3 existing content rows (slides 1, 2, 3) in place with new titles and bodies:
   - Slide 1 -> "Learning Objectives"
   - Slide 2 -> "Before a Showing or Meeting a New Buyer"
   - Slide 3 -> "During a Showing"
2. INSERT 2 new content rows (slides 4, 5):
   - Slide 4 -> "Open Houses & Red Flags"
   - Slide 5 -> "If Something Feels Wrong"
3. UPDATE the existing practice_assignment row: set `slide_number = 6`, title "Practice Assignment", body = provided text.
4. UPDATE the existing knowledge_check row: set `slide_number = 7`, title "Knowledge Check", body = provided text.

All writes scoped to `module_id = 5b61cb4b-598e-4db7-b5ec-c23ca60a4c53`.

## Exact content to write (verbatim)

**Slide 1 — Learning Objectives (content)**
This module exists because real estate agents regularly meet unfamiliar people alone, in empty or unfamiliar properties, often with an address shared publicly in advance - that's a real, ordinary risk of the job, not a rare edge case. By the end of this module, the agent can: apply basic protocol before, during, and after a showing or open house to reduce personal risk; know what information to gather about a new contact before meeting them alone; recognize red flags worth acting on, without becoming paranoid about ordinary clients; know exactly who to notify and how, if something feels wrong.

**Slide 2 — Before a Showing or Meeting a New Buyer (content)**
Get a name and phone number before agreeing to meet anyone alone, even for a "quick" showing - a serious buyer will not be put off by this. For a truly unknown lead (not from your sphere, not referred, not already vetted through FUB), consider a first meeting at the office or another public location rather than an empty house, especially outside business hours. Share your schedule - tell your mentor, a colleague, or a family member where you're going and roughly when you expect to be done, every time, not just when something feels off in advance.

**Slide 3 — During a Showing (content)**
Let the client walk in front of you, not behind you, where practical - know where the exits are in any property you're showing. Keep your phone charged, accessible, and on you - not in a bag left in another room. Trust your instincts - if something feels wrong, it's fine to end a showing early with a simple, calm reason; you never need to justify leaving a situation that feels unsafe.

**Slide 4 — Open Houses & Red Flags (content)**
Sign-in sheets or digital check-in for every visitor - this isn't just a lead-capture habit, it's a basic safety record of who was in the property. Where possible, avoid running a full open house completely alone, especially for higher-traffic listings - confirm current team practice with your mentor. Keep your exit path clear and be aware of who's positioned between you and the door. Red flags worth acting on (most clients are exactly who they say they are, this isn't about treating every buyer with suspicion): refusing to share basic contact information before a showing; insisting on odd hours or an empty, hard-to-find property with no clear reason; any interaction that makes you personally uncomfortable, even if you can't articulate exactly why - you don't need a specific justification to trust your own read on a situation.

**Slide 5 — If Something Feels Wrong (content)**
Leave. You don't need to finish a showing, explain yourself fully, or worry about losing the lead. Notify your mentor or team leader as soon as you're safely able to, even if nothing ultimately happened - patterns matter, and a "nothing happened, but" report today can matter for someone else's safety later. Confirm with your mentor what specific safety tools or check-in systems the team currently uses (a safety app, a group check-in habit, etc.) - this module covers the general protocol; the specific tooling should come from your team directly.

**Slide 6 — Practice Assignment (practice_assignment)**
1) Walk through your mentor's actual habits for a first showing with a brand-new, unvetted lead - compare it to what's covered in Slide 2. 2) Confirm the team's current check-in protocol (who you tell, how, before a showing) directly with your mentor. 3) Role-play ending a showing early and calmly, without over-explaining, in response to a hypothetical uncomfortable situation.

**Slide 7 — Knowledge Check (knowledge_check)**
1) A new, unvetted lead wants to see a vacant home this evening - what should the agent do before agreeing? 2) Does an agent need a specific justification to end a showing early if something feels wrong? (No) 3) Why does an open house need a sign-in process beyond lead capture? (Basic safety record of who was in the property) 4) If a showing ends with nothing actually happening, but something felt off, should the agent still report it? (Yes)

## Verification after write
Re-query Module 12 and show raw rows (slide_number, slide_type, title, body length). Then run a cross-module rollup (count of slides per module for modules 1-11) to confirm no other module's slides changed.
