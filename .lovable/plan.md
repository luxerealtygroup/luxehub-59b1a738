# Portal Documents & Photos

Add manual upload of documents and photos to each client portal, scoped to the client's portal record (client_accounts.id). Admins upload/delete; agents view; clients view/download.

## Permissions
- **Admin** (`owner`/`admin` via `has_role`): upload, delete, view
- **Agent** (`agent`): view only
- **Client** (`client_accounts.user_id = auth.uid()`): view/download only

## Database (one migration)

**Storage buckets** (private, created via `supabase--storage_create_bucket`):
- `portal-documents`
- `portal-photos`

**Tables** (public schema, with GRANTs + RLS):

`portal_documents`
- id, portal_id (FK client_accounts), file_name, file_path (storage key), file_type, file_size, uploaded_by (auth.users), created_at

`portal_photos`
- id, portal_id (FK client_accounts), file_path, caption, category (enum: 'property'|'milestone'), uploaded_by, created_at

**RLS policies** on both tables:
- SELECT: admin OR agent (`is_team_member`) OR owning client (`portal_id` matches a `client_accounts` row where `user_id = auth.uid()`)
- INSERT/DELETE: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner')`

**Storage RLS** on `storage.objects` for both buckets:
- SELECT: same three-role rule (path prefix = `<portal_id>/...`)
- INSERT/DELETE: admin/owner only

Files stored under `<portal_id>/documents/<uuid>_<name>` and `<portal_id>/photos/<category>/<uuid>_<name>`.

## Frontend

**Admin/agent side — extend `AgentPortalDialog.tsx`:**
- Add two new tabs after Tasks: **Documents** and **Photos**
- Reuse existing `FileUpload` styling
- Show upload UI only when `isAdmin`; agents see the read-only list
- Documents: list with file icon, name, date, preview (PDF/image modal) or download (signed URL)
- Photos: gallery grid split "Property Photos" / "Milestone Photos"; category selector on upload
- Delete button visible to admin only

**Client side — extend `ClientDashboard` + `ClientSidebar`:**
- Existing `DriveDocuments` tab continues to work; add new `PortalDocuments` component that lists rows from `portal_documents` for their active portal (scoped by selected transaction / active `client_accounts` row)
- New `Photos` sidebar item between Documents and Messages → `PortalPhotos` gallery component
- Empty states: "Your agent will add your documents here soon." / "Your agent will add photos here soon."

**New components:**
- `src/components/portal/PortalDocumentsPanel.tsx` (admin/agent view, upload when admin)
- `src/components/portal/PortalPhotosPanel.tsx` (admin/agent view, upload when admin)
- `src/pages/client-portal/components/PortalDocumentsView.tsx` (client read-only)
- `src/pages/client-portal/components/PortalPhotosView.tsx` (client read-only)

Signed URLs (1h expiry) via `supabase.storage.from(bucket).createSignedUrl(path, 3600)` for previews and downloads.

## Transaction scoping
The portal today keys off `client_accounts.id` (one portal per client record). Documents/photos are stored per portal_id, which is the "currently selected transaction" the client sees. No schema change needed for multi-transaction — this matches the current single-portal-per-client model.

## Out of scope
- No changes to Google Drive integration
- No changes to FUB timeline or tasks
- No email notifications on upload
