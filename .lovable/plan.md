## Extend Client Portal with FUB Timeline, Tasks, Invite Flow

### Database changes (one migration)
Extend `client_accounts`:
- add `client_type` text ('buyer' | 'seller')
- add `drive_folder_id` text, `slack_channel_id` text

Extend `client_tasks`:
- add `status` text default 'pending' (values: pending, complete) — keep existing `completed_at`
- add `notes` text (alias for description use)

Create `portal_timeline_notes`:
- id uuid pk, client_account_id uuid fk → client_accounts, user_id uuid (agent), stage text, note text, created_at, updated_at
- RLS: agent (invited_by) and owners manage; client can view their own

Grants + RLS + timestamps triggers included.

No new `client_portals` table — `client_accounts` already covers user_id/client_email/fub_person_id/invited_by. Magic link comes from Supabase auth OTP so no token columns needed.

### FUB integration
Reuse existing `FOLLOW_UP_BOSS_API_KEY` and existing `follow-up-boss` edge function. Add one new action `get_person_deals` (query `/v1/deals?personId=X`) returning deal stage + stageEnteredAt history. Frontend derives the actual FUB stage list dynamically per contact — no hardcoded 7 stages.

### Client portal Overview
Replace empty transaction area in `ClientDashboard.tsx` with a new `FUBTimeline` component:
- Fetches FUB deals for `client_accounts.fub_person_id` via the new action
- Renders vertical timeline of the actual FUB stages, dated, current stage highlighted
- Shows any `portal_timeline_notes` under each stage

### Agent side
- `AgentPortalView` (new modal/drawer opened from a client row): shows the same timeline, lets agent add a note per stage, and manage tasks
- Add **"Invite to Client Portal"** button on Pipeline rows and Deals — opens a new `ClientPortalInviteDialog`:
  - Fields: client name, email, client_type (buyer/seller), FUB contact (typeahead reusing `FUBContactTypeahead`), Drive folder ID, Slack channel ID
  - On submit: upsert `client_accounts` (invited_by = agent), then call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: /client-portal, shouldCreateUser: true, data: { full_name } } })` to send magic-link invitation

### Tasks tab
Extend the existing client task list:
- Agent creates tasks with title, due_date, notes
- Client toggles complete (sets status + completed_at)
- Uses existing `client_tasks` table with new `status`/`notes` columns

### Files touched (approx)
- `supabase/migrations/<new>.sql`
- `supabase/functions/follow-up-boss/index.ts` (+ `get_person_deals` action)
- `src/lib/api/followUpBoss.ts` (+ `getPersonDeals`)
- `src/pages/client-portal/components/FUBTimeline.tsx` (new)
- `src/pages/client-portal/ClientDashboard.tsx` (wire timeline)
- `src/pages/client-portal/components/ClientTaskList.tsx` (status toggle)
- `src/components/ClientPortalInviteDialog.tsx` (new, replaces/augments existing `ClientInviteDialog`)
- `src/components/FUBDealSections.tsx` and `src/components/PipelineReport.tsx` (add invite button)
- `src/components/admin/AgentPortalView.tsx` (new agent-side timeline+notes+tasks panel)

### Notes
- Uses Supabase magic link (`signInWithOtp`) — no custom token table needed
- Reuses existing FUB API key; no new secret
- Stage list comes from real FUB deal stages per contact
