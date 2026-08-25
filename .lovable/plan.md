# Plan: Make slack-list-channels resilient to missing groups:read scope

## Current problem (verified)
The deployed `slack-list-channels` now requests `types=public_channel,private_channel`. Slack requires the `groups:read` scope to list private channels; the current bot token lacks it, so Slack rejects the **entire** `conversations.list` call with `missing_scope` (`needed: groups:read`). Verified by calling the live function:

```
502 {"error":"missing_scope","needed":"groups:read","provided":"chat:write,channels:read,channels:history"}
```

Result: the SlackChannelPicker is **broken for everyone right now** — it shows zero channels (public included) until `groups:read` is granted and the app reinstalled.

## Fix (single file: `supabase/functions/slack-list-channels/index.ts`)
Make listing private channels best-effort so public channels always work:

1. First attempt `conversations.list` with `types=public_channel,private_channel` (both).
2. If Slack returns `missing_scope`, fall back to a second call with `types=public_channel` only.
3. Return whatever channels succeed. If both fail for another reason, surface the error as today.

This keeps the intended end state (private channels visible once `groups:read` is present) while guaranteeing the picker works today for public channels, so no one is blocked.

### Behavior table
| `groups:read` granted? | Result |
|---|---|
| No (today) | Public channels list fine; no private channels. No error to the user. |
| Yes (after reinstall) | Both public and private channels list. |

## Not changing
- `SlackChannelPicker.tsx` UI (already renders lock icon for private).
- No scope/config edits in code — scope is added out of band on the Slack app.
- No auto-invite automation.

## After edit
Redeploy `slack-list-channels` and re-call the function to confirm public channels now return successfully.
