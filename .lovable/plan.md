# Read-only audit: Asana and harness references (no changes)

## 1. "Asana" references

User-visible UI:
- src/components/AccountsPayable.tsx:146, 149, 162 — Admin Dashboard "Accounts Payable" card text: "Connect your Asana Accounts Payable project", "Asana Project ID" field, help text naming app.asana.com. Calls the `asana-create-task` function (line 56) to list tasks. Shown via src/components/AdminDashboard.tsx:1494 (comment at 1493).
- src/pages/GetStarted.tsx:358 — onboarding question "Do you use Asana?" (saves `uses_asana`).
- src/pages/AdminOnboardingRequests.tsx:319 — "Asana" yes/no detail; line 92 adds an `ASANA_ACCESS_TOKEN` line to a copied setup checklist.
- supabase/functions/_shared/transactional-email-templates/onboarding-request.tsx:60 — "Uses Asana" row in the onboarding-request email.
- supabase/functions/support-chat/index.ts:17 — support assistant prompt mentions Asana (can surface in chat answers).
- Database text: migrations 20260812154304 and 20260820164536 seed Launchpad slides describing the TC/Asana split (agents see these slides).

Not user-visible (code/data only):
- src/components/submissions/AsanaFieldMapping.tsx (9) — settings component, no longer imported anywhere (hidden).
- src/components/submissions/FileUpload.tsx:178, 186 — comments only.
- supabase/functions/asana-create-task/index.ts (33) — function calling app.asana.com; config entry supabase/config.toml:15.
- supabase/functions/submit-onboarding-request/index.ts:111, 148 — stores/forwards uses_asana.
- src/integrations/supabase/types.ts (20) — generated types for asana_settings, uses_asana, submissions.asana_* columns.
- Migrations 20260105145237, 20260727170208, 20260901004546, 20260902011012 — asana_settings table, policies, asana_* columns.
- tests/submission-slack.test.ts:24, 28 and tests/submission-slack-flow.test.tsx:19 — assert Slack messages never include Asana.

No submission form links or buttons point to Asana.

## 2. Harness check
- supabase/functions/slack-test-harness: absent. No "harness" in supabase/ or tests/.
- public._harness_gate: does not exist in the database (lookup returned null).
- Leftovers: src/integrations/supabase/types.ts:17 still lists `_harness_gate` (stale generated types; regenerates automatically). docs/tenant-isolation-inventory.md:118 says "the test harness itself" for the unrelated isolation-check function.

No action proposed.
