## Goal
Add a **Property Address** field to pipeline entries when the client type is **Seller**. Captured in Add/Edit dialogs and shown on the seller rows/cards.

## Changes

### 1. Database (migration)
Add a nullable column to `pipeline_clients`:
```sql
ALTER TABLE public.pipeline_clients
  ADD COLUMN IF NOT EXISTS property_address text;
```
No backfill, no RLS changes (existing policies cover all columns).

### 2. `src/pages/Pipeline.tsx`
- Add `property_address?: string` to the `PipelineClient` interface and `property_address: string` to `NewClient` (default `''`).
- **Add Client dialog**: when `newClient.client_type === 'seller'`, render a "Property Address" input (full-width) under the client name row.
- **Edit Client dialog**: same conditional input bound to `editingClient.property_address`.
- Include `property_address: <value> || null` in both the insert (`handleAddClient`) and update (`handleUpdateClient`) payloads.
- On the seller table row and any seller card display, show the address as a small muted line under the client name when present.

### Out of scope
- Buyers, tenants, landlords — no UI change.
- No changes to FUB sync, reports, business planning, or other pages.
- Separate Expected-Pending-Date save bug stays untouched.
