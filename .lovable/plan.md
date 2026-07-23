# Fix: Coaching notes not appearing on the agent's Weekly Coaching page

## Root cause (verified)

The `coaching_sessions` table currently has **two rows** for Lexi (`a836b0cc…`) with the same `week_of = 2026-07-20` (created at 3:22pm and 3:44pm on Jul 21). This is because there is no unique constraint on `(agent_id, week_of)`, so `generate-coaching-notes` fell through its `onConflict` upsert path and inserted a duplicate row instead of updating.

On `/dashboard/411`, `FourOneOne.tsx` fetches the note with:

```ts
supabase
  .from('coaching_sessions')
  .select('generated_notes')
  .eq('agent_id', queryUserId)
  .eq('week_of', weekStart)
  .maybeSingle();
```

`.maybeSingle()` errors when more than one row matches (PGRST116), so `data` is `null`, `coachingNote` stays `null`, and the "Coaching Notes — Week of …" card at line 1073 never renders. Nothing else on the page pulls the AI note, so the agent sees no coaching content.

Note: the "Accountability Notes" text fields (Wins This Week / Challenges / Next Steps / Additional Notes) are the agent's own free-form inputs bound to `weeklyData` — they were never designed to be filled by the AI-generated note. The AI note has its own dedicated card directly beneath them. The user's report of "empty placeholders" is really "the AI note card isn't showing up at all."

RLS is fine: `Agents can view their own coaching sessions` (`auth.uid() = agent_id`) covers Lexi, and admins are covered by `is_admin_or_owner`. Week normalization is fine: both the admin generator and `FourOneOne` use `startOfWeek(..., { weekStartsOn: 1 })`, and the stored `week_of` values are Mondays.

## Fix

### 1. Deduplicate existing rows (migration)
For every `(agent_id, week_of)` group with more than one row in `coaching_sessions`, keep the newest by `created_at` and delete the older duplicates. This resolves Lexi's immediate case and any other silently-duplicated pairs.

### 2. Add a unique constraint (migration)
Add `UNIQUE (agent_id, week_of)` on `public.coaching_sessions` so the existing `onConflict: "agent_id,week_of"` upsert in `supabase/functions/generate-coaching-notes/index.ts` actually merges instead of inserting duplicates. Future re-generations for the same week will overwrite the prior note as intended.

### 3. Harden the fetch in `src/pages/FourOneOne.tsx`
Replace the `.maybeSingle()` call in the coaching-note fetch effect (around line 340) with an `.order('created_at', { ascending: false }).limit(1)` query and read `data?.[0]?.generated_notes`. This makes the page resilient if any historical duplicates ever slip through again.

No other files change. The admin `CoachingNotes.tsx` page keeps working as-is; the constraint just makes its "regenerate for same week" behavior update instead of duplicate.

## Verification

- Query `coaching_sessions` for Lexi + `2026-07-20` and confirm exactly one row remains (the newer 3:44pm one, 8005 chars).
- Load `/dashboard/411` while impersonating Lexi for the week of Jul 20, 2026 and confirm the "Coaching Notes — Week of Jul 20, 2026" card renders below the Accountability Notes with the generated content and a working Copy button.
- Re-run "Generate Notes" from the admin page for the same agent/week and confirm the row is updated (same `id`), not duplicated.
