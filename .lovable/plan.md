# Google Drive OAuth — 403 Diagnosis

No code changes proposed. This is an investigation report.

## What I verified in the code

**Frontend** (`src/components/GoogleDriveConnect.tsx`)
- Sends `redirect_uri = ${window.location.origin}/agent/google-drive/callback`
- On preview that resolves to:
  `https://id-preview--4a480d64-1066-455f-b5ff-2462d98492dc.lovable.app/agent/google-drive/callback`

**Edge function** (`supabase/functions/google-drive-files/index.ts`)
- Reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from Lovable Cloud secrets (both confirmed present)
- Builds a standard `https://accounts.google.com/o/oauth2/v2/auth?...` URL with:
  - `client_id` = the secret
  - `redirect_uri` = value passed from browser (unmodified)
  - `scope` = `drive.readonly openid email`
  - `access_type=offline`, `prompt=consent`, `state=<user.id>`

The wiring itself is correct. The 403 is happening on **Google's side** before the user ever sees a consent screen, which narrows it to one of three provider-side causes.

## Most likely root cause (in order)

### 1. OAuth consent screen "User type = Internal" + non-Workspace account
This is the #1 cause of a bare Google 403 "you do not have access to this page" **before** login/consent. If the OAuth client's consent screen is configured as **Internal**, only Google Workspace users in the *same* organization as the Cloud project can proceed. A personal `@gmail.com` (or a Workspace user from a different domain) is blocked with exactly this page.

**Check:** Google Cloud Console → APIs & Services → OAuth consent screen → **User type**. If it says *Internal*, either
- switch it to *External* (then add test users while in Testing mode, or Publish), OR
- only sign in with a Workspace account inside the owning org.

### 2. Testing mode with no test users added
If User type is *External* and Publishing status is *Testing*, Google shows an "access blocked / app not verified" screen — but for some accounts (particularly when the Drive scope is treated as sensitive/restricted and no test users exist) it can degrade to the same 403.

**Check:** OAuth consent screen → **Test users**. Add the exact Google account you're testing with. Or click **Publish app** to move out of Testing.

### 3. Wrong OAuth client type
`GOOGLE_CLIENT_ID` is reused from the Calendar integration. If that client was created as anything other than **Web application** (e.g., iOS, Android, TVs and Limited Input, Desktop), the `/o/oauth2/v2/auth` endpoint with a browser `redirect_uri` returns 403 immediately.

**Check:** Google Cloud Console → Credentials → open the client → **Application type** must be *Web application*.

### 4. Cloud project / OAuth client disabled or deleted
If the project that owns `GOOGLE_CLIENT_ID` was suspended, billing-disabled, or the credential was deleted, Google returns the same generic 403.

**Check:** Credentials page shows the client is present and enabled; project has no suspension banner.

## Things that are NOT the cause

- **Redirect URI mismatch** — that produces a different, specific Google page ("Error 400: redirect_uri_mismatch") *after* you sign in, not a 403 before login. So the two callback URLs I asked you to add are still needed, but they are not what's triggering this particular error.
- **Missing secret / edge function error** — those would surface as a toast in the app, not a Google-hosted 403 page.
- **Scopes** — invalid scopes produce a Google error page with the offending scope named, not this generic 403.

## What to check, in order

1. Open Google Cloud Console → **APIs & Services → OAuth consent screen**
   - Confirm **User type**. If *Internal*, that is almost certainly the cause.
   - If *External* + *Testing*, confirm your Google account is in **Test users**.
2. **APIs & Services → Credentials** → open the OAuth client behind `GOOGLE_CLIENT_ID`
   - Confirm **Application type = Web application**.
   - Confirm both callback URLs are listed under **Authorized redirect URIs**:
     - `https://luxehub.lovable.app/agent/google-drive/callback`
     - `https://id-preview--4a480d64-1066-455f-b5ff-2462d98492dc.lovable.app/agent/google-drive/callback`
3. **APIs & Services → Enabled APIs** → confirm **Google Drive API** is enabled on this Cloud project (Calendar being enabled does not imply Drive is).
4. Retry the flow. If it now reaches consent, we're done. If a *different* error appears (redirect_uri_mismatch, invalid_scope, access_denied), share the exact message and I'll take the next step.

Report back what you find in steps 1–3 and I'll advise on any code-side follow-up (there may be none).
