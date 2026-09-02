# "View as team" — super-admin read-only tenant preview

Kristen (super-admin of the original LUXE org) can open any team's hub as that team
sees it, on `luxerealtyhub.com`, without joining the org and without the tenant
subdomain resolving.

## Approach (recommended): server-side preview endpoint, zero RLS changes

The safest path is **not** to widen any tenant policy. Instead the preview reads
through one dedicated, audited server function that is read-only by construction.

```text
/dashboard/admin/tenants → "Preview hub"
    → POST org-preview { action: 'start', org_id }        (audited row)
    → app enters preview mode  →  /dashboard?preview_org=<id>
        every data read for the previewed org goes through
        POST org-preview { action: 'read', dataset }      (SELECT-only allowlist)
    → "Exit preview" → POST org-preview { action: 'stop' }
```

Why: the existing `current_user_org_id()` is used in both `USING` and `WITH CHECK`
on ~50 tables. Making it return a preview org would silently make **writes** to
another tenant possible too. A single-purpose endpoint keeps isolation policies
exactly as they are and can never write.

### 1. Audit table + gate (the only DB change)
- New `org_preview_sessions`: `id, actor_id, org_id, started_at, ended_at,
  expires_at (default now() + 60 min)`.
- RLS: insert/select/update only when `is_super_admin(auth.uid())`; grants to
  `authenticated` + `service_role`. Nothing else in the schema changes; no existing
  policy is dropped, rewritten, or loosened.
- Every preview start writes a row, so there is a permanent record of who previewed
  which team and when.

### 2. `org-preview` edge function (`verify_jwt = true`)
- Resolves the caller from their JWT (never from the request body) and hard-fails
  unless `is_super_admin(caller)` returns true — so an org owner gets 403 even with
  a forged `org_id`.
- `start` / `stop` manage the audit row. `read` accepts only a fixed dataset name
  from an allowlist (`branding`, `dashboard_summary`, `pipeline`, `transactions`,
  `weekly_411`, `portal_shell`, `integrations`) and runs a parameterised SELECT for
  that org. There is no code path in the function that can INSERT, UPDATE or DELETE
  tenant data.
- Returns `fubEnabled: false` when the org has no `FUB_API_KEY` in `org_integrations`,
  so FUB-free mode renders exactly as that team will see it.

### 3. Frontend
- `useOrgPreview.tsx` — provider mirroring `usePortalPreview`: module-level read-only
  flag armed during render, `blockOrgPreviewWrite()` for any handler, preview org id
  kept in the URL (`?preview_org=`) plus `sessionStorage` so a reload stays in preview
  and closing the tab drops it.
- `TenantProvider` gains a preview branch: when preview is active it uses the branding
  returned by `org-preview` instead of the signed-in org, so logo, colours and hub name
  are the tenant's — this is what makes it work without DNS.
- `OrgPreviewBanner` — persistent sticky bar: "Previewing **Homes Into Reality** —
  read-only" with an always-visible **Exit preview** button; also disables the sidebar's
  "View as Agent" and Demo Mode while active.
- Dashboard, Pipeline, Transactions and Weekly Coaching read from the preview datasets
  when preview is on (empty states for both new teams), and the client-portal shell
  renders with the tenant's branding and no client data.
- `AdminTenants.tsx`: each row in Existing teams gets a **Preview hub** action, shown
  only when `is_super_admin` is true.

### 4. Read-only guarantees
- UI: every write handler on the previewed surfaces calls `blockOrgPreviewWrite()` and
  returns with a toast.
- Server: the preview endpoint has no write path, and the signed-in JWT still resolves
  to LUXE for direct Supabase calls — so even a bypassed UI cannot write to the tenant's
  rows, because tenant policies were never widened.

## Rejected alternative
Overriding `current_user_org_id()` with a preview org: one-line change, but it grants
the previewed org to every `WITH CHECK` as well, i.e. cross-tenant write capability
gated only by application code. Not worth it.

## Verification before reporting back
1. Preview Homes Into Reality and The Kirstine-Ellis Group from `luxerealtyhub.com`:
   branding, empty dashboard/pipeline/transactions/411, portal shell, FUB hidden.
2. Confirm a non-super-admin (test-org admin) gets 403 from `org-preview` with each
   tenant's id, and that LUXE's own data is unchanged after previewing.
3. Confirm an attempted write while in preview is blocked and leaves no row.
