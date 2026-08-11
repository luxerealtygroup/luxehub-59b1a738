# Launchpad — 90-Day Onboarding Curriculum

A new top-level nav item where agents step through a 12-module onboarding curriculum as a slide-deck experience, with track-based content (Junior / Associate) and per-agent progress tracking.

## 1. Data model

Four new tables plus two profile fields.

**profiles (add two columns)**
- `launchpad_track` — `junior` | `associate` | null (set by admin, editable by admin; agent sees it read-only)
- `mentor_id` — the profile of the agent's mentor (no mentor concept exists in the app today, so this is new)

**launchpad_modules** — the 12 module definitions
- `module_number` (1–12), `title`, `subtitle`
- `track` — `junior` | `associate` | `unified` (Modules 2, 10, 11, 12 are `unified`; the other 8 get two rows, one per track)
- `day_range_start`, `day_range_end` (e.g. 1–15, 16–45, 46–75, 76–90)
- `kind` — `module` | `reference` (Module 10, the Vendor & Preferred Partner list, is `reference`: no practice assignment, no knowledge check)
- `has_practice_assignment`, `has_knowledge_check` (booleans)
- `sort_order`, `is_published`

**launchpad_slides** — the pages inside a module
- `module_id`, `slide_number`, `title`
- `slide_type` — `content` | `practice_assignment` | `knowledge_check`
- `body` (rich text, empty placeholder for now)
- `content` (JSON — holds knowledge-check questions or assignment checklist later; empty for now)

**launchpad_progress** — one row per agent per slide
- `user_id`, `module_id`, `slide_id`, `completed_at`

**launchpad_module_progress** — rollup per agent per module (kept as its own row so mentors can read status cheaply)
- `user_id`, `module_id`, `status` (`not_started` | `in_progress` | `completed`), `last_slide_number`, `started_at`, `completed_at`

Module and slide definitions are seeded as data (titles + day ranges only, empty slide bodies) so content can be edited later without a code change.

**Access rules**
- Modules and slides: readable by any signed-in team member; only admins/owners can create or edit them.
- Progress: an agent reads and writes only their own rows; their mentor and admins can read them.
- Track: only admins can change `launchpad_track` and `mentor_id`.

## 2. Track-based visibility

Each agent has one track on their profile. The module list query returns modules where `track = <agent's track> OR track = 'unified'`, ordered by day range then module number. That yields 12 visible modules per agent: 8 track-specific, 4 unified (Modules 2, 10, 11, 12). Module 8 naturally renders as "Negotiation Fundamentals" for Junior and "Negotiation Scriptbook" for Associate because they are separate rows.

If an agent has no track set, Launchpad shows a short "ask your admin to assign your track" state rather than a broken list. Admins/owners can toggle between tracks to preview either curriculum.

## 3. Navigation and progress

**Launchpad home** (`/dashboard/launchpad`) — the 12 modules grouped by day range (Days 1–15, 16–45, 46–75, 76–90), each card showing title, slide count, and a progress ring. Module 10 is visually marked as a reference document.

**Module viewer** (`/dashboard/launchpad/:moduleId/:slideNumber`) — the slide-deck experience:
- One slide at a time in a fixed content frame, Back / Next controls, a progress bar with slide counter, and a slide-jump strip so agents can revisit an earlier slide.
- Keyboard arrows for forward/back, and the URL carries the slide number so refreshing or sharing lands on the same slide.
- Slide order: content slides → practice assignment slide (mentor-led) → knowledge check slide. Module 10 ends after its content slides.
- Advancing past a slide marks it complete; finishing the last slide marks the module complete and offers "Next module".

**Progress visibility**
- Agent: progress rings on the home page plus an overall "X of 12 modules complete" header.
- Mentor/admin: a Launchpad progress view listing their assigned agents, each agent's track, modules completed, current module, and last activity date.

**Navigation entry:** a top-level "Launchpad" item in the main sidebar (rocket icon), visible to agents and admins.

## Deployment and blast radius

- **No staging database.** The project has one backend; approving the migration applies it to the live database agents are using right now. There is no separate preview database to test against first.
- **Almost everything is new.** 4 new tables, their grants and policies, and 1 new security-definer helper (`is_mentor_of`). No existing function or trigger is altered or dropped, and no existing data is written or deleted. Seed rows go only into the new Launchpad tables.
- **The one existing shared object touched is `profiles`:** two nullable columns, no default and no backfill, so existing rows and every current query are unaffected.
- **Correction to my earlier answer on policies.** `profiles` today has a policy `Users can update their own profile` with `USING (auth.uid() = id)` and **no WITH CHECK clause and no column restriction**. That means any signed-in agent could set their own `launchpad_track` and `mentor_id` — self-assigning their curriculum track and their mentor. Preventing that requires touching an existing policy path. Two options:
  - **Option A (recommended, no policy change):** leave all existing policies untouched and add a new `BEFORE UPDATE` trigger on `profiles` that raises an error if a non-admin changes `launchpad_track` or `mentor_id`. New object only; existing policies stay byte-identical.
  - **Option B:** replace `Users can update their own profile` with a version that blocks changes to those two columns. This edits a live policy that governs all profile self-updates — higher risk, not recommended without staging.
  The plan assumes **Option A** unless you say otherwise.

### Exact SQL against the existing `profiles` table

```sql
-- 1. Two new nullable columns. No default, no backfill, no rewrite of existing rows.
ALTER TABLE public.profiles
  ADD COLUMN launchpad_track text
    CHECK (launchpad_track IN ('junior','associate')),
  ADD COLUMN mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_mentor_id ON public.profiles(mentor_id);

-- 2. No GRANT change needed: `authenticated` already holds table-level
--    SELECT/UPDATE on public.profiles, which covers new columns automatically.

-- 3. No existing RLS policy is dropped or replaced. Reads and admin writes are
--    already covered by the current policies:
--      SELECT "Team members can view profiles" -> is_team_member(auth.uid()) OR auth.uid() = id
--      UPDATE "Admins can update any profile"  -> is_admin_or_owner(auth.uid())
--      UPDATE "Users can update their own profile" -> auth.uid() = id
--    Instead, a NEW trigger guards the two new columns from agent self-edits:
CREATE OR REPLACE FUNCTION public.guard_launchpad_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.launchpad_track IS DISTINCT FROM OLD.launchpad_track
      OR NEW.mentor_id IS DISTINCT FROM OLD.mentor_id)
     AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change Launchpad track or mentor assignment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_launchpad_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_launchpad_profile_fields();
```

Rollback for this block is `DROP TRIGGER ... ; DROP FUNCTION ... ; ALTER TABLE public.profiles DROP COLUMN launchpad_track, DROP COLUMN mentor_id;`

### Backups

On Lovable Cloud I can't inspect or trigger backups, and point-in-time recovery is not something this project has enabled — so plainly: **assume there is no verified recent restore point you can roll back to.** The mitigation is that the migration is additive and fully reversible by the DROP statements above; nothing it does destroys existing data. If you want a guaranteed restore point first, the practical move is to hold approval until you have exported the data you care about.

## Technical notes

- Migration adds the five schema changes above with grants and RLS, plus a seed insert of **20 module rows** (8 titles x 2 tracks = 16, plus 4 unified rows: Modules 2, 10, 11, 12) and empty placeholder slides per module.
- Mentor reads use a security-definer helper (`is_mentor_of(user_id)`) so RLS policies stay non-recursive.
- New files: `src/pages/Launchpad.tsx`, `src/pages/LaunchpadModule.tsx`, `src/components/launchpad/` (module card, slide frame, nav controls, progress rail, mentor progress table), `src/hooks/useLaunchpad.ts`.
- Edited: `src/App.tsx` (routes), `src/components/AppSidebar.tsx` (nav entry), admin agent editing UI for track/mentor assignment.
- No training content is authored — every slide body ships empty.
