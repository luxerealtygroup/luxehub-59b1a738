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
- **Nothing existing is modified.** The migration only creates new objects: 4 new tables, their grants and policies, and 1 new security-definer helper (`is_mentor_of`). No existing policy, function, trigger, or table is altered or dropped.
- **One exception worth naming:** the two new columns on `profiles` (`launchpad_track`, `mentor_id`) do touch an existing shared table. They are added nullable, with no default and no backfill, so existing rows and every current query are unaffected. The existing `profiles` access rules are left exactly as they are and simply extend to cover the new columns.
- Seed rows are inserted only into the new Launchpad tables. No existing data is written or deleted.

## Technical notes

- Migration adds the five schema changes above with grants and RLS, plus a seed insert of **20 module rows** (8 titles x 2 tracks = 16, plus 4 unified rows: Modules 2, 10, 11, 12) and empty placeholder slides per module.
- Mentor reads use a security-definer helper (`is_mentor_of(user_id)`) so RLS policies stay non-recursive.
- New files: `src/pages/Launchpad.tsx`, `src/pages/LaunchpadModule.tsx`, `src/components/launchpad/` (module card, slide frame, nav controls, progress rail, mentor progress table), `src/hooks/useLaunchpad.ts`.
- Edited: `src/App.tsx` (routes), `src/components/AppSidebar.tsx` (nav entry), admin agent editing UI for track/mentor assignment.
- No training content is authored — every slide body ships empty.
