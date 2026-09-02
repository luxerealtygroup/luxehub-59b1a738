# Tenant isolation inventory

Audit date: 2 September 2026. One row per data path. "Org mandatory" means the
DATA layer (RLS policy or server-side credential resolution) requires
`org_id = current_user_org_id()` — never the UI, never inferred from identity.

Legend: **YES** = org_id mandatory · **PARENT** = scoped through a parent row that
is itself org-mandatory · **SELF** = own row only (`auth.uid()`), no cross-tenant
reach by design · **INSTANCE** = deliberately instance-wide, super-admin or
service-role only.

## 1. Tables (all have RLS enabled)

| Table | Surface | Org mandatory | Notes |
|---|---|---|---|
| ac_nominations | Nominations admin | YES | |
| agent_activities | Activity tracking | YES | |
| agent_claude_profiles | Coaching | YES | |
| agent_documents | Agent docs | YES | |
| agent_goals | Goals | YES | |
| agent_google_drive_tokens | Drive integration | SELF | `user_id = auth.uid()`; per-user OAuth token, no cross-user reach |
| appointment_records | 4-1-1 | YES | |
| asana_settings | Asana integration | YES | **fixed this pass** — was readable by any signed-in user in any org |
| business_planning_reflections | Business planning | YES | |
| client_accounts | Portals | YES | client rows additionally scoped by `user_id` |
| client_documents | Portal docs | YES | client branch is PARENT via client_accounts |
| client_messages | Portal chat | YES + PARENT | |
| client_tasks | Portal tasks | YES + PARENT | |
| client_transactions | Transactions | YES | |
| cma_generations | CMA Studio | YES | via `org_id = (select org_id from profiles where id = auth.uid())` — equivalent predicate |
| cma_import_logs | CMA Studio | YES | |
| cma_reports | CMA Studio | YES | |
| coaching_sessions | Coaching notes | YES | |
| commissions | Transactions / GCI | YES | |
| company_budget_expenses | Admin dashboard | YES | |
| company_goals | Admin dashboard | YES | |
| deal_metadata / deal_participants / deal_sources / deals | Pipeline, reports | YES | participants also allow own row |
| deal_source_categories | Source taxonomy | YES | **fixed** — was `USING (true)` for all orgs; `org_id IS NULL` remains readable as shared seed data |
| deal_source_targets | Source targets | YES | **fixed** — same as above |
| email_send_log / email_send_state / email_unsubscribe_tokens / suppressed_emails | Email plumbing | INSTANCE | service-role only; no user-facing read path |
| fub_deal_events | FUB sync log | YES | **fixed** — was any org's admin |
| fub_person_events | FUB sync log | YES | **fixed** |
| fub_webhook_events | FUB webhook log | YES | **fixed** |
| important_documents | Document library | YES | |
| instance_integrations | /setup status | INSTANCE | **fixed** — now super-admin only (was any org owner) |
| launchpad_modules / launchpad_slides | Launchpad curriculum | YES | **fixed**; `org_id IS NULL` = shared template |
| launchpad_progress / launchpad_module_progress | Launchpad progress | YES | **fixed** — mentor/admin branch now requires same org |
| manual_production | Manual production | YES | |
| notifications | Bell / notifications | YES | |
| onboarding_requests | New-team signups | INSTANCE | **fixed** — super-admin only (was any org admin); public INSERT stays, rate-limited |
| open_houses / open_house_attendees | Open houses | YES + PARENT | |
| org_integrations / org_invites / organizations | Tenant admin | YES | cross-org reach only via `is_super_admin` |
| org_preview_sessions | Preview hub | INSTANCE | super-admin + `actor_id = auth.uid()`; audited by design |
| org_resources | Resources | YES | |
| pipeline_clients / pipeline_gap_settings | Pipeline | YES | |
| planning_assumptions / planning_reflections / production_goals | Planning | YES | |
| portal_condition_notes / portal_contacts / portal_documents / portal_fub_deals / portal_key_dates / portal_messages / portal_photos / portal_properties / portal_timeline_notes / portal_transaction_conditions / portal_transactions | Client portal | YES + PARENT | client branch is PARENT via `client_accounts.user_id` |
| profiles | Everywhere | YES | own row, or same-org team member, or super admin |
| profiles_backup_pre_launchpad_20260811 | Historical backup | INSTANCE | super-admin only |
| recruiting_pipeline | Recruiting | YES | **fixed** — was any org's admin |
| sales_activities / sales_metrics | Reports | YES | |
| submissions | Buyer/seller submissions | YES | |
| support_tickets / support_messages | Support | YES + PARENT | |
| training_documents | Training library | YES | |
| transaction_milestones | Timeline | PARENT | via client_transactions (org mandatory) |
| user_roles | Roles / auth | YES (via profile join) | **fixed** — admin read and owner writes now require the target user to be in the caller's org (`user_in_my_org`) |
| weekly_411 | Weekly accountability | YES | |

## 2. Views

| View | Org mandatory | Notes |
|---|---|---|
| portal_sides | PARENT | `security_invoker`; reads portal tables, so caller RLS applies |

## 3. RPCs / database functions

| Function | Scoping | Notes |
|---|---|---|
| current_user_org_id | — | source of truth for org predicates |
| user_in_my_org | org | new helper for user_roles |
| has_role / is_admin_or_owner / is_team_member / is_client / is_demo_account | identity | role checks only; always combined with an org predicate in policies |
| is_super_admin | org | requires membership of the original org |
| can_access_portal / owns_portal / get_portal_realtor | PARENT | portal ownership |
| get_team_agents | org | **fixed this pass** — now filters `p.org_id = current_user_org_id()` |
| create_org_invite / revoke_org_invite / claim_org_invite / validate_org_invite | org | seat limits enforced per org |
| create_portal_invite / claim_portal_invite / validate_portal_invite | PARENT | |
| get_org_secret / set_org_secret / set_my_org_secret / org_has_integration | org | per-org Vault credentials |
| get_instance_secret / set_instance_secret | INSTANCE | owner/service only |
| provision_organization / resolve_org_by_host | super admin / public branding | branding fields only |
| portal_send_email / portal_should_email / notify_* triggers | PARENT | |
| email queue helpers (enqueue/read/delete/dispatch/wake/move_to_dlq) | INSTANCE | service role |
| set_org_id_from_context | org | stamps org_id on insert for every org-scoped table |
| increment_cma_version / update_updated_at_column / guard_* | PARENT / self | |

## 4. Edge functions

| Function | Auth | Org mandatory | Notes |
|---|---|---|---|
| follow-up-boss | JWT + role | YES | CRM key resolved per caller org; other tenants hard-fail |
| fub-search-contacts / fub-create-contact / fub-post-note | JWT staff | YES | org-scoped key |
| fub-push-attachment | service | YES | **fixed this pass** — key now resolved from the portal's org |
| fub-webhook | signature | INSTANCE | inbound CRM events |
| org-preview | JWT super admin | YES | allowlisted SELECT-only reads, audited |
| tenant-branding | public | YES | branding fields only, resolved by hostname |
| instance-setup | owner | INSTANCE | writes Vault credentials, never returns values |
| slack-interactivity / slack-list-channels / asana-create-task | signature / JWT staff | org via caller | integration credentials resolved per org |
| portal-send-message | JWT | PARENT | portal ownership checked |
| generate-cma / cma-analyze / cma-scrape-link / extract-listing-data | JWT staff | YES | writes stamped with caller org |
| coach-me / generate-coaching-notes / business-planning-ai / reflection-ai / sync-claude-profiles | JWT staff | YES | |
| create-agent / create-demo-account | JWT admin | YES | new profiles get caller org |
| google-calendar / google-drive-files | JWT | SELF | per-user OAuth |
| support-chat | JWT | PARENT | |
| send/preview-transactional-email, process-email-queue, handle-email-unsubscribe, handle-email-suppression | service / token | INSTANCE | |
| submit-onboarding-request | public | INSTANCE | rate-limited insert only |
| payments-webhook / create-checkout | signature / JWT | org | subscription lives on the org row |
| db-health-check | cron/service | INSTANCE | |
| luxehub-mcp / mcp | OAuth | YES | reads go through RLS with the user's token |
| isolation-check | shared secret | — | the test harness itself |

## 5. Client-side queries

All browser queries use the shared Supabase client with the user's JWT, so the
table rows above are the enforcement point. No client query is trusted for
scoping; UI filters (agent selector, "view as agent") are conveniences layered on
top of policies that already require `org_id`.

## 6. Cannot be made org-scoped, and why

- **Email plumbing tables and the queue functions** — instance-wide by design
  (one sender infrastructure). No tenant data beyond recipient addresses.
- **`organizations`, `org_preview_sessions`, `profiles_backup_*`,
  `instance_integrations`, `onboarding_requests`** — deliberately instance-wide,
  restricted to super admins of the original org.
- **Follow Up Boss data itself** — lives in the CRM, not in our database. It is
  isolated by resolving the API key per organization; a tenant with no key of its
  own gets an explicit "not connected" error rather than a fallback.

## 7. Automated regression test

See `tests/tenant-isolation.test.ts` and `supabase/functions/isolation-check`.
Runs as part of `npm run build`; a leak fails the build.
