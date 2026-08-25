# Verify the Follow Up Boss document push end to end

## What I could confirm read-only (no changes made)

- The `fub-push-attachment` function is deployed and reachable. A live call with a fake document id returned `404 {"error":"Document not found"}`, so auth passes and it reaches the database lookup.
- The tracking columns exist on `portal_documents`: `fub_attachment_id`, `fub_pushed_at`, `fub_push_error`.
- There are **zero** rows in `portal_documents` — no document has ever been uploaded to a portal.
- All three client portals (`Lee Carter`, two `Kristen Schulz` rows) have `fub_person_id = NULL` — **no portal is linked to a Follow Up Boss contact.**

## Honest conclusion

The push path has **never actually run against Follow Up Boss**. Nothing has been proven beyond "the function deploys, authenticates, and looks up documents". The claim that the file transfer works is unverified: no call to `POST /personAttachments` has happened, so the method (direct server-side byte upload as multipart form data, no signed URL) is what the code does but is **not confirmed working**.

Verification requires writes (linking a FUB contact and uploading a file), which plan mode does not allow. Here is the test to run on approval.

## Verification steps to run

1. Link a FUB contact to one test portal: set `fub_person_id` on the `Lee Carter` portal to a real Follow Up Boss person id (I need which contact is safe to use — see question below).
2. Upload a small throwaway PDF through the portal's Documents tab as the agent, so the real client-side code path fires (not a hand-crafted invocation).
3. Read the resulting `portal_documents` row and report the raw values of `fub_attachment_id`, `fub_pushed_at`, `fub_push_error`.
4. Pull `fub-push-attachment` edge logs for that invocation and quote the actual lines: the FUB response status, and the error body verbatim if non-2xx.
5. Confirm in Follow Up Boss that the attachment appears on that contact's record.
6. Clean up: delete the test document row plus the storage object, and reset `fub_person_id` to `NULL` if it was only set for the test.

## Risk to expect in step 3/4

Follow Up Boss's `/personAttachments` endpoint may expect a JSON body with a publicly fetchable `uri` for the file rather than a `multipart/form-data` byte upload. The current implementation sends raw bytes as multipart. If the test returns a `400`, that is the likely cause, and the fix is to switch to a short-lived signed URL from the private `portal-documents` bucket and post that `uri` instead. I will report the exact error text before changing anything.

## Technical notes

- File bytes are read server-side with the service role, so the `portal-documents` bucket stays private; no public URL is created today.
- The push is fire-and-forget from `PortalDocumentsPanel.tsx` and swallows failures, so a broken push is silent in the UI — the only evidence is `fub_push_error` and the edge logs. That is why this test matters.
