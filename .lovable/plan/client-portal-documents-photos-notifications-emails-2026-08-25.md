# Client Portal: documents, photos, notifications & emails

## What I found

**Agent uploads (Manage modal)**
- Documents → storage bucket `portal-documents`, row in table `portal_documents` (portal_id, file_name, file_path, uploaded_by).
- Photos → storage bucket `portal-photos`, row in `portal_photos` with `category` = `property` or `milestone`.
- Both tabs render `PortalDocumentsPanel` / `PortalPhotosPanel` with `canManage`.

**Client side (/client-portal)**
- Not stubs in code: `ClientDashboard.tsx` already renders the same `PortalDocumentsPanel` and `PortalPhotosPanel` with `canManage={false}`, and the photos panel already groups Property/Milestone and has a lightbox. Storage policies already allow the owning client to read both buckets via `owns_portal(...)`.
- Two unused legacy Google-Drive components (`DriveDocuments`, `DrivePhotos`) are still imported in `ClientDashboard.tsx` — likely the source of the old "coming soon" behaviour before the panels were wired.
- So the "coming soon" you're seeing is either a stale published build or a data/empty-state issue, not missing code. Step 1 of the work is to verify live in the browser as the client before changing anything.

**Notifications**
- Table `notifications` (user_id, portal_id, message_id, client_name, message_preview, is_read) — chat-shaped only, no `type` or link column.
- Trigger `notify_agent_of_client_message` on `portal_messages` already fires **both** directions (client→agent and agent→client), realtime is enabled, and both bells (`NotificationsBell`, `ClientNotificationsBell`) read it live.
- Nothing fires for new documents, photos, or tasks.

**Email**
- Real path exists: `send-transactional-email` edge function + template registry with 3 templates (portal invite, open-house feedback, support escalation), queue-backed via `enqueue_email`, logged to `email_send_log`, with unsubscribe/suppression handling.
- All client accounts on file have an email address.

## Plan

**1. Verify the client-facing tabs live**
Sign in as a portal client, open Documents and Photos, and confirm the panels list what the agent uploaded and download works. Remove the dead `DriveDocuments`/`DrivePhotos` imports. Fix whatever the live check surfaces (empty-state wording, read policy, or portal_id resolution). Keep "no documents yet" / "no photos yet" empty states.

**2. Generalise the notification record**
Migration on `notifications`: add `type` (`message` | `document` | `photo` | `task`, default `message`), `title`, and `link` (tab to open), all nullable/defaulted so existing rows and both bells keep working. Both bells get a per-type icon and open the right tab instead of always the chat.

**3. Notify the client on new content**
New triggers writing into `notifications`:
- `portal_documents` insert → notify the portal's client user.
- `portal_photos` insert → notify the client, labelled by category.
- `client_tasks` insert → notify the client (skip when the client created it).
- Messages: keep the existing bidirectional trigger; the agent's bell already reflects client messages, which I'll re-verify end to end.

**4. Email the client**
Three new templates (`portal-new-documents`, `portal-new-photos`, `portal-new-task`) plus a message template, sent through the existing queue to the email on `client_accounts`, respecting suppression/unsubscribe.
Volume default: **one email per event, deduped per portal + type within a 10-minute window**, so uploading 12 photos sends one "New photos added" email rather than 12. Say the word if you'd rather have strictly one email per file.
Agents keep bell-only for client messages (Slack already relays portal messages); easy to add agent emails if you want them.

## Technical notes
- Notification inserts happen in `SECURITY DEFINER` triggers so RLS never blocks them; email enqueue is wrapped so a mail failure can never roll back an upload or task.
- New notification columns are additive with defaults — no breaking change to `useNotifications`.
- No changes to CMA Studio, `cma-analyze`, or `generate-cma`.
