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

### 4. Per-org branding at runtime
- Add columns to `organizations`: `app_name, short_name, brokerage_name,
  brokerage_legal_name, support_email, website_domain` (nullable; original org left NULL
  to keep falling back to env/LUXE defaults).
- New `useTenant()` hook: reads the current user's org row, merges over the env-based
  `tenant` defaults (LUXE), so branding is live per org without a rebuild.
- Replace brokerage-specific `tenant.*` reads (app name, brokerage name, logo, colour,
  support email) with the hook in the app chrome, emails, reports, and client portal.
- Edge functions already have `_shared/tenant.ts`; add an org-aware lookup for the
  caller's org branding in email/Slack functions.

### 5. Provisioning UI — in-app admin action
- New admin page `/dashboard/admin/tenants` (and an action on each setup request):
  create an `organizations` row from a request (name, contact → owner account, logo,
  colour, optional FUB key field), mark `tier`, and assign the request's contact as the
  new org's owner (create their auth account / invite them as owner of the new org).
- "Provision from request" button on `AdminOnboardingRequests` → pre-fills the new-tenant
  form, sets the request to `in_setup` then `live`.
- FUB key is entered by the brokerage's owner directly (never by us) — they get an owner
  invite and set it in `/setup`, which we extend to write per-org into Vault.

### 6. Provision the two tenants
- Tenant A: **Homes Into Reality** (from the existing request — Gabriele Battista).
- Tenant B: one more real brokerage — details to be supplied (or submitted via
  `/get-started`); provisioned the same way once built.

## Risks / non-goals
- Big RLS rewrite touches ~50 tables; done in one migration with backfill so existing
  LUXE data stays visible to the original org.
- The original LUXE org is untouched in behaviour (org_id backfilled, env branding still
  the fallback, instance FUB key still the fallback).
- Stripe billing tiers stay org-scoped via the existing `organizations.stripe_*` columns.
- Scope here is data isolation + branding + FUB + provisioning. It does **not** include
  per-org Slack workspaces or per-org email sending domains in this pass (those stay
  instance-wide for now; Slack per-org is a follow-up).
