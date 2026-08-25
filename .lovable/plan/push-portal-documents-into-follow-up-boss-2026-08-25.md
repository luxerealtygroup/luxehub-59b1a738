# Push portal documents into Follow Up Boss

When a document is uploaded to a portal's Documents tab — by the agent or the client — and that portal is linked to a Follow Up Boss contact, a copy is pushed into FUB automatically. One upload, visible in both places.

## Behaviour

- Trigger point: a new row in `portal_documents` (the same table both the agent dialog and the client portal write to), so both upload paths are covered with one implementation.
- If the portal's `client_accounts.fub_person_id` is null: skip silently. Nothing shown to the user, no error, no retry.
- The push never blocks or fails the upload. It is fire-and-forget: the upload UI completes and refreshes exactly as it does today, even if FUB is slow, rate-limited, or erroring. Same pattern as the Phase 0 email notifications.
- Failures are logged server-side only (function logs), so we can inspect them without bothering agents or clients.
- Duplicate protection: each document is pushed at most once, tracked by a marker on the document row so a retry or re-render can't create duplicate attachments in FUB.

## Deal attachments — recommendation: skip for now

FUB also has `POST /dealAttachments`, but attaching there requires picking "the" deal for the contact, and a contact often has several (active, closed, lost, buy plus sell). Choosing wrong files paperwork onto the wrong transaction, which is worse than not attaching. Person attachments are already visible on the contact record where the team works, so the plan is person-only. If Kristen wants deal attachments later, the natural version is an explicit deal picker on the upload, not an automatic guess.

## Does FUB need a public URL for the file?

The `portal-documents` bucket is private, so the file is not reachable by an outside service by default. Two ways to hand FUB the bytes:

1. Preferred — send the file directly. The backend function downloads the object from the `portal-documents` bucket using its service-role access and posts the raw bytes to FUB as a multipart upload. No public or signed URL ever leaves our system, nothing expires, and the private bucket stays private.
2. Fallback — if FUB's endpoint turns out to require a fetchable URI rather than accepting an uploaded file, we generate a short-lived signed URL for the object (the same `createSignedUrl` mechanism the Documents tab already uses for preview/download, e.g. a 1-hour expiry) and pass that. The signed URL is single-purpose and expires on its own; FUB stores its own copy of the file, so expiry after the fetch is harmless.

We will confirm which shape FUB accepts during implementation and use option 1 if it works.

## Open decision for Kristen — flagged, not decided

Should this apply retroactively to documents already sitting in portals before this ships, or only to new uploads going forward?

- Forward-only: simplest, zero risk of surprising duplicates in FUB.
- Retroactive backfill: a one-time pass over existing `portal_documents` rows whose portal has a `fub_person_id`. Doable, but existing files may already have been manually uploaded into FUB by the team, so a backfill could create visible duplicates on contact records. If Kristen wants it, we'd run it as a separate, reviewable step after the forward path is confirmed working — possibly limited to a date range or specific portals.

## Technical notes

- New edge function (e.g. `fub-push-attachment`) that takes a `portal_documents` id, loads the row plus its portal's `fub_person_id`, exits early if unlinked or already pushed, downloads the storage object with the service role, and posts to `POST /personAttachments` on `https://api.followupboss.com/v1`.
- Reuses the existing FUB credential and the retry-with-backoff `fubFetch` helper pattern already in the `follow-up-boss` function, so transient FUB 5xx/network errors self-heal without user impact.
- Invocation is fire-and-forget from the upload paths (`PortalDocumentsPanel` insert, and the client-side upload) — the response is not awaited for UI purposes and any rejection is swallowed.
- Adds one small column to `portal_documents` to record the FUB attachment id / push timestamp, which gives us both idempotency and an audit trail of what synced.
