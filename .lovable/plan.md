# Multi-tenant LUXEhub — one project, many brokerages

## Goal
Keep a single project. Each brokerage is a tenant row in `organizations`. Data is
isolated by `org_id` + RLS scoped to the caller's org. Each tenant has its own name,
logo, colour, and **optional** Follow Up Boss API key. Provisioning a new brokerage is
an in-app admin action — never a project copy/remix.

This overrides the earlier recommendation to use separate deployments.

## Foundation that already exists
- `organizations` table with `id, name, tier, branding_logo_url,
  branding_primary_color, is_original_org`.
- `profiles.org_id` links every user to an org; `current_user_org_id()` resolves it.
- `tenant.ts` (frontend) and `_shared/tenant.ts` (edge) env-based branding — to be
  made runtime/per-org.
- `/get-started` intake → `onboarding_requests` → admin review (1 pending: Homes Into
  Reality).
- `instance_integrations` + `get_instance_secret` for instance-wide FUB key.

## What's missing (the work)

### 1. Add `org_id` to every tenant-scoped table + backfill
Add nullable `org_id uuid references organizations` to all shared data tables:
deals, deal_participants, deal_metadata, pipeline_clients, pipeline_gap_settings,
client_accounts, client_transactions, client_documents, client_messages,
client_tasks, portal_properties, portal_documents, portal_messages, portal_photos,
portal_transactions, portal_contacts, portal_key_dates, portal_condition_notes,
portal_timeline_notes, portal_transaction_conditions, portal_fub_deals, commissions,
transaction_milestones, coaching_sessions, agent_goals, agent_activities,
agent_documents, sales_activities, sales_metrics, manual_production, production_goals,
company_goals, company_budget_expenses, business_planning_reflections,
planning_assumptions, planning_reflections, weekly_411, notifications, open_houses,
open_house_attendees, appointment_records, cma_reports, cma_import_logs,
support_tickets, support_messages, submissions, ac_nominations.

Backfill every existing row with the original org's id (`is_original_org = true`).
Add a `set_org_id_on_insert` BEFORE INSERT trigger on each so new rows inherit the
caller's org automatically.

Tables that stay **global** (no org_id): `organizations`, `user_roles`,
`deal_source_categories`, `deal_source_targets`, `launchpad_modules`,
`launchpad_slides`, `onboarding_requests`, `recruiting_pipeline`, `instance_integrations`,
`fub_*_events`, `email_*`, `suppressed_emails`.

### 2. Rewrite RLS so admins/owners are scoped to their org
Today every admin/owner policy reads "view all" — that's the cross-tenant leak. Replace
with `org_id = current_user_org_id()` on all tenant-scoped tables, while keeping:
- Agents see only their own rows (by `user_id`) **within their org**.
- Clients see only their own portal.
- The original-org owner keeps full access to the original org only.

`is_admin_or_owner()` stays for *capability* checks; data scoping moves to
`current_user_org_id()` in policy `USING`/`WITH CHECK`. Add a guard so a row's org_id can
never be set to an org the actor isn't an admin/owner of.

### 3. Per-org Follow Up Boss key
- New `org_integrations` table: `org_id, key ('FUB_API_KEY'), vault_secret_name, last4,
  updated_at, updated_by` — mirrors `instance_integrations`.
- Vault secret named `org_<orgid>_fub_api_key`.
- New `get_org_secret(_org_id, _key)` SECURITY DEFINER function.
- `getInstanceSecret('FUB_API_KEY')` in `_shared/fub.ts` becomes: resolve caller's org
  from the JWT → `get_org_secret`; if none, fall back to the instance-wide key (so the
  original LUXE org keeps working unchanged).
- Optional per tenant: a brokerage without FUB simply has no key; FUB features are
  hidden/disabled for that org.

### 4. Per-org branding at runtime + hostname routing
- Add columns to `organizations`: `slug` (unique, required), `app_name, short_name,
  brokerage_name, brokerage_legal_name, support_email, website_domain` (nullable;
  original org left NULL to keep falling back to env/LUXE defaults).
- New `useTenant()` hook: reads the current user's org row, merges over the env-based
  `tenant` defaults (LUXE), so branding is live per org without a rebuild.
- Replace brokerage-specific `tenant.*` reads (app name, brokerage name, logo, colour,
  support email) with the hook in the app chrome, emails, reports, and client portal.
- Edge functions already have `_shared/tenant.ts`; add an org-aware lookup for the
  caller's org branding in email/Slack functions.

**Hostname-based tenant resolution (pre-auth).** Signed-out pages — login, invite
accept, client portal, `/get-started` — must know the tenant before any JWT exists:
- Support `<slug>.luxerealtyhub.com` plus an optional custom `website_domain`.
- New SECURITY DEFINER function `resolve_org_by_host(_host text)` returning only public
  branding (id, slug, name, logo, colour, app name) — safe for `anon`, no private data.
- Frontend resolver parses `window.location.hostname`, strips the known apex/preview
  hosts, calls the function once, caches it in a `TenantProvider` and feeds `useTenant()`.
  Unknown host or bare apex → original LUXE defaults.
- Signup/invite flows stamp the resolved org onto the new profile so a user who accepts
  on a tenant subdomain lands in that tenant.
- Note: wildcard DNS/TLS for `*.luxerealtyhub.com` must be configured at the domain level
  for subdomains to serve; the app-side resolution is built regardless.

### 5. Provisioning UI — in-app admin action, with agent seats
- New admin page `/dashboard/admin/tenants` (and an action on each setup request):
  create an `organizations` row from a request (name, slug, contact → owner account,
  logo, colour, optional FUB key field), mark `tier`, and assign the request's contact as
  the new org's owner (create their auth account / invite them as owner of the new org).
- "Provision from request" button on `AdminOnboardingRequests` → pre-fills the new-tenant
  form, sets the request to `in_setup` then `live`.
- FUB key is entered by the brokerage's owner directly (never by us) — they get an owner
  invite and set it in `/setup`, which we extend to write per-org into Vault.
- **Agent seats.** New `org_invites` table (`org_id, email, role, token, expires_at,
  used_at, invited_by`) plus an owner-facing page `/dashboard/team` where an org owner
  invites additional agents into their own org (tenant B is an 8-person team).
  - Accepting an invite creates the profile with that `org_id` and the invited role in
    `user_roles`; the org's owner can revoke/resend and deactivate a seat.
  - Seat count is capped by the org's tier; owners can only invite into their own org
    (enforced in RLS + a SECURITY DEFINER accept function, never client-trusted).
  - Each invited agent sees only their own pipeline, goals, 411 and clients within that
    org; the org owner/admin sees the whole org and nothing outside it.

### 6. Safety: backup + single-transaction migration
- Take a database backup / restore point immediately before the migration runs, and
  record the restore point name in the migration description.
- The whole ~50-table change ships as **one migration executed in a single transaction**
  (schema, backfill, triggers, policy drops/creates) so any failure rolls back cleanly
  with zero partial state. No multi-step split.
- Policy changes are drop-then-create within that same transaction; nothing is left
  policy-less at commit time.

### 7. Post-migration verification — before anything else
Run and report results before provisioning any real tenant:
1. Original LUXE org: dashboard, pipeline, transactions/commissions and weekly
   accountability (411) all still load with the same row counts as pre-migration
   (counts captured before the migration for comparison).
2. Pat Ullman's client portal loads, with all 7 documents present on 5 Elm PVE St.,
   photos and timeline intact.
3. A second **test** org (throwaway, not a real tenant) with its own test user sees
   NONE of the LUXE data — every list is empty and direct-ID reads are denied.
4. Report all three results back before any real tenant is provisioned.
5. **Do not publish** at any point in this work.

### 8. Provision the two tenants (only after verification passes)
- Tenant A: **Homes Into Reality** (from the existing request — Gabriele Battista).
- Tenant B: 8-person team — details to be supplied (or submitted via `/get-started`);
  provisioned the same way, with agent-seat invites for the other 7.


## Risks / non-goals
- Big RLS rewrite touches ~50 tables; done in one migration with backfill so existing
  LUXE data stays visible to the original org.
- The original LUXE org is untouched in behaviour (org_id backfilled, env branding still
  the fallback, instance FUB key still the fallback).
- Stripe billing tiers stay org-scoped via the existing `organizations.stripe_*` columns.
- Scope here is data isolation + branding + FUB + provisioning. It does **not** include
  per-org Slack workspaces or per-org email sending domains in this pass (those stay
  instance-wide for now; Slack per-org is a follow-up).
