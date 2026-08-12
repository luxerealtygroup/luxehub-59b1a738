# Module 1 (Associate) — Slide 3 Body Update

Content-only fix to exactly one row. No schema changes, no new slides, no renumbering, no other slide or module touched.

## Target row

- Table: `launchpad_slides`
- `module_id = '427b567f-4f41-498c-9ffe-18de0f12868c'` (Module 1, Associate)
- `slide_number = 3` (title "What's Actually New Here (Systems)", slide_type `content`)
- Current body: 418 chars. This is the only field changed; title and slide_type stay the same.

No `WHERE` clause touches any other module — it filters on both `module_id` and `slide_number`, so only this one row is reachable.

## New body text

```
What's Actually New Here (Systems): The LUXEhub/Asana split trips up experienced agents most — you submit and track everything through LUXEhub, your TC handles Asana. Our FUB smart lists are queue-based, not a linear funnel: CALL NOW, HANDRAISERS — AI ENGAGED, NEW — NOT CONTACTED, NEW — ATTEMPTED CONTACT, A — Hot Prospect (priority); B — Warm (21 days), C — Cool (45 days), Long Term Nurture (90 days), Sphere/Past Clients (quarterly) (cadence). Separately, there's the Lead Day Pond — a shared pond, not a personal list. Each agent is assigned a weekday as their lead day and is responsible for monitoring the pond and calling every lead in it on that day. This applies to every agent regardless of track — confirm your assigned day with your mentor.
```

Stored as plain text (the slide viewer renders `whitespace-pre-wrap`), matching how the other Module 1 slides are already stored.

## SQL

A single `UPDATE` scoped to `module_id` and `slide_number`:

```sql
UPDATE launchpad_slides
SET body = $1, updated_at = now()
WHERE module_id = '427b567f-4f41-498c-9ffe-18de0f12868c'
  AND slide_number = 3;
```

(`updated_at` is stamped by the existing trigger regardless; included for clarity.)

## Verification

After the update I will re-query and paste the raw slide 3 row (title, body char length) for this module, plus a count/spot-check that no other slide or module in `launchpad_slides` changed — comparing against the known state: this module has 6 slides (4 content + practice_assignment + knowledge_check), all other modules unchanged at their placeholder counts.
