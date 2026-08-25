# Plan: List private channels in the Slack channel picker

## Goal
Update `slack-list-channels` so the picker shows both public and private Slack channels the bot is already a member of, so agents can select a private channel as a portal's `slack_channel_id` without pasting an ID.

## Change (single file)
`supabase/functions/slack-list-channels/index.ts` — change the `conversations.list` `types` parameter from `public_channel` to `public_channel,private_channel`, and update the accompanying comment.

No other changes:
- No UI changes to `SlackChannelPicker.tsx` (it already renders `is_private` with a lock icon).
- No scope changes in code — relies on `groups:read` (and `channels:read`) being granted on the Slack bot token out of band, plus reinstalling the app.
- No auto-invite automation.

## Caveat
This requires the Slack bot token to have the `groups:read` scope. Without it, Slack returns `missing_scope` and the whole list call fails (public channels included). The user will add the scope and reinstall the app before relying on this.

## After edit
Redeploy the `slack-list-channels` edge function.
