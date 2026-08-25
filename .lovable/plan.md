# Verify the Follow Up Boss push with a throwaway test contact

## Answer: yes, we can avoid involving Kristen

Follow Up Boss's API does support creating a person, and we already have two working code paths that do it:

- `supabase/functions/follow-up-boss/index.ts` — the `create_person` action does `POST /people` with name, email, source and tags.
- `supabase/functions/fub-create-contact/index.ts` — a simpler `POST /people` used by the open-house form.

So a disposable test person can be created entirely through the API, with no real client involved.

**One caveat on cleanup:** FUB's API does expose `DELETE /people/{id}`, but nothing in our codebase calls it today — the `follow-up-boss` wrapper only has create/update/read actions. Deleting the test person therefore needs either a one-off delete action added to the wrapper, or Kristen deleting the single test contact manually from the FUB UI (10 seconds). I'd rather not permanently widen our FUB wrapper with a delete capability just for a test, so my recommendation is the manual removal, clearly named so it's unmistakable.

## Current state I confirmed (read-only)

- `fub-push-attachment` is deployed and reachable — a call with a fake id returned `404 {"error":"Document not found"}`, so auth and the DB lookup work.
- `portal_documents` has `fub_attachment_id`, `fub_pushed_at`, `fub_push_error`, and **zero rows** — no document has ever been uploaded.
- All three portals have `fub_person_id = NULL`, so the FUB push has **never actually run**. Nothing about the file transfer to FUB is proven yet.

## Test plan

1. Create a throwaway FUB person via the API, named unambiguously (e.g. first name `ZZ-LUXEHUB`, last name `TEST-DELETE-ME`, source `LUXEhub Integration Test`, no phone, dummy email). Record the returned person id.
2. Temporarily set `fub_person_id` to that id on one of the two `Kristen Schulz` test portals (the older duplicate, so the live-looking one is untouched).
3. Upload a small throwaway PDF to that portal's Documents tab through the real app UI as the agent, so the actual client-side fire-and-forget path runs rather than a hand-crafted invocation.
4. Read the resulting `portal_documents` row and report raw values of `fub_attachment_id`, `fub_pushed_at`, `fub_push_error`.
5. Pull `fub-push-attachment` edge logs for that invocation and quote the real lines — the HTTP status FUB returned and, if non-2xx, the verbatim error body.
6. Confirm the attachment is actually on that test person by reading it back from FUB.
7. Clean up: delete the `portal_documents` row, remove the object from the `portal-documents` storage bucket, reset `fub_person_id` to `NULL` on that portal, and delete the test person in FUB (via a temporary delete call, or Kristen removes the one clearly-labelled contact — your call).

## Risk this test is designed to catch

The current implementation posts raw file bytes to `/personAttachments` as `multipart/form-data`. FUB may instead require a JSON body with a publicly fetchable `uri`. If step 4/5 shows a `400`, that is the likely cause, and the fix would be to generate a short-lived signed URL from the private `portal-documents` bucket and send that `uri`. I will report the exact error text before changing any code.

## Technical notes

- Today the bucket stays private and bytes are read server-side with the service role — no public URL is created. That method is what the code does but is **not yet confirmed working against FUB**.
- The push is fire-and-forget and swallows failures, so a broken push is invisible in the UI; `fub_push_error` and the edge logs are the only evidence. That's exactly why this empirical test matters.
- Steps 1, 2, 3 and 7 are writes (FUB record, database, storage), so they need your approval before I run them.
