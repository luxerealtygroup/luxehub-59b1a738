# Support Chat & Ticketing Plan

## Overview
A floating "Chat with Support" widget available to authenticated realtors (inside `/dashboard/*`) and authenticated clients (inside `/client-portal/*`). An AI assistant (Lovable AI) triages the issue in-chat, tries to resolve common problems, and escalates to a human ticket when it can't — or when the user explicitly requests it. Admins get a new page to view, respond to, and close tickets. Escalations auto-notify and auto-assign to Kristen Schulz (`info@luxerealtygroup.ca`).

---

## 1. UI

**Floating widget component** — `src/components/support/SupportChatWidget.tsx`
- Fixed bottom-right launcher button (headset icon), opens a popover chat panel (~380×560).
- Visual style consistent with `PortalChatPanel`.
- States: intro → AI chat → "Escalated" confirmation.
- Header actions: minimize, "Talk to a human" (force-escalate), close.
- Composer with Enter-to-send, streaming assistant responses, markdown rendering.

**Mounting points (authed areas only)**
- `src/components/DashboardLayout.tsx` — all authed realtor pages.
- `src/pages/client-portal/ClientDashboard.tsx` — clients.
- **Not** mounted on `/login`, `/signup`, `/nominate`, `/forgot-password`, `/reset-password`, `/unsubscribe`, or any other public route. No unauthenticated support surface.

**Admin-side ticket management** — `src/pages/AdminTickets.tsx`
- Master list (open / pending / resolved), filters by role (realtor vs client), search.
- Detail view: full transcript (AI + user + admin replies), user context (name, email, role, route captured at ticket time), status controls, internal notes, reply composer.
- Sidebar link "Support Tickets" under Admin section in `AppSidebar.tsx` (admin/owner only).
- Route added in `App.tsx` under the admin guard.

---

## 2. Database

New tables (all with RLS + GRANTs, `updated_at` trigger):

**`support_tickets`**
- `user_id`, `user_email`, `user_type` ('realtor' | 'client'), `subject` (AI-generated), `status` ('ai_active' | 'escalated' | 'in_progress' | 'resolved' | 'closed'), `priority`, `context_route`, `context_metadata` (jsonb), `assigned_admin_id`, `resolved_at`.

**`support_messages`**
- `ticket_id` FK, `sender_type` ('user' | 'ai' | 'admin' | 'system'), `sender_user_id`, `content`, `metadata` (jsonb).

**RLS**
- Users select/insert their own tickets and messages (`user_id = auth.uid()`).
- Admins/owners (via existing `has_role`) select/update all.
- Message inserts require ticket ownership OR admin role.

**Default assignment on escalation**
- A DB trigger on `support_tickets` fires when `status` transitions to `escalated`: looks up the auth user for `info@luxerealtygroup.ca` and sets `assigned_admin_id` to Kristen's `user_id` if the column is null. Also inserts an in-app row into the existing `notifications` table for that user, and calls the transactional email function (via `pg_net`) or — cleaner — the escalation is triggered from the edge function which handles both (see §3).

---

## 3. AI diagnostic chat

**Edge function** — `supabase/functions/support-chat/index.ts` (`verify_jwt = true`)
- Input: `{ ticket_id?, message, context: { route, user_type } }`.
- If no `ticket_id`, creates a new ticket (status `ai_active`) seeded with user role, email, and app context.
- Loads full transcript, streams a response from Lovable AI Gateway (`openai/gpt-5.5`, AI SDK `streamText` + `toUIMessageStreamResponse`).
- System prompt: LUXEhub support agent — familiar with Pipeline, Portals, FUB sync, CMA, Business Planning, Notifications, etc. — asks clarifying questions, gives step-by-step fixes, offers to escalate.
- Persists user + assistant messages via `onFinish`.

**Escalation path (handled centrally)**
- Tool `escalate_to_human({ reason, summary })` the AI can call, plus a direct "Talk to a human" client action, both hit the same server handler.
- Handler steps (single transaction where possible):
  1. Update the ticket: `status = 'escalated'`, `assigned_admin_id = <Kristen's user_id>` (looked up once from `auth.users` by email `info@luxerealtygroup.ca`, cached in an env var `ESCALATION_ADMIN_USER_ID` for reliability), `escalation_reason`, `escalated_at`.
  2. Insert a `system` message summarizing the AI's diagnosis so admins have context.
  3. Insert an in-app `notifications` row for Kristen (existing bell system picks it up automatically).
  4. Invoke `send-transactional-email` with a new template `support-ticket-escalated` → `info@luxerealtygroup.ca`, idempotency key `escalation-<ticket_id>`.

**New email template** — `supabase/functions/_shared/transactional-email-templates/support-ticket-escalated.tsx`
- Registered in `registry.ts`.
- Fields: user name/email/role, subject, AI-generated summary, escalation reason, timestamp, deep link to `/dashboard/admin/tickets/<id>`.
- Subject example: `[LUXEhub Support] New escalated ticket — {user_name}`.

**Model**: `openai/gpt-5.5` via existing `LOVABLE_API_KEY`.

---

## 4. Admin flow

- Kristen receives both an in-app notification (bell) and an email at `info@luxerealtygroup.ca` on every escalation.
- Ticket appears in `/dashboard/admin/tickets` already assigned to her (visible in the "Assigned" column, filterable). Other admins/owners can still view, reassign, or reply.
- Admin reply inserts a `support_messages` row (`sender_type='admin'`); user sees it via realtime and gets a notification.
- Status transitions: `escalated` → `in_progress` (first admin reply) → `resolved` (admin action) → auto-close after N days.

---

## 5. Realtime

- Widget subscribes to `support_messages` filtered by `ticket_id` (same pattern as `PortalChatPanel`).
- Admin ticket detail subscribes the same way.

---

## Technical section

**Files to add**
- `src/components/support/SupportChatWidget.tsx`
- `src/hooks/useSupportTicket.ts`
- `src/pages/AdminTickets.tsx`
- `supabase/functions/support-chat/index.ts` (+ `deno.json`)
- `supabase/functions/_shared/transactional-email-templates/support-ticket-escalated.tsx`

**Files to modify**
- `src/App.tsx` — add `/dashboard/admin/tickets` route (admin guard).
- `src/components/DashboardLayout.tsx` — mount widget (authed realtor area).
- `src/pages/client-portal/ClientDashboard.tsx` — mount widget (authed client area).
- `src/components/AppSidebar.tsx` — admin sidebar link.
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template.
- `supabase/config.toml` — register `support-chat` function.

**Migrations**
- Create `support_tickets`, `support_messages` with GRANTs, RLS, policies, and `update_updated_at_column` triggers.

**Secrets**
- Add `ESCALATION_ADMIN_EMAIL` = `info@luxerealtygroup.ca` and (optional cache) `ESCALATION_ADMIN_USER_ID`. `LOVABLE_API_KEY` already exists.

**Deploys**
- After creating template + function, deploy `send-transactional-email` and `support-chat`.

---

## Confirmed decisions
1. Widget is authenticated-only — no public/logged-out support surface.
2. Escalations send an email to `info@luxerealtygroup.ca` (Kristen) via the existing app-email system, in addition to the in-app notification.
3. Escalated tickets are auto-assigned to Kristen's account by default (other admins can still reassign).