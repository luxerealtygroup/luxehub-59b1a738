# Test the client-to-Slack message relay

Goal: prove that a message sent from a client portal actually appears in a linked Slack channel, using a throwaway test portal and no permanent changes.

Test portal: **Kristen Schulz / kristen@example.com** (the Jan 8 seeded row, no real inbox).
Direction: **client to Slack only.** Slack-to-portal replies are out of scope for this test.

## Prerequisite Kristen needs to handle

Pick a Slack channel for the test and make sure the LUXEhub bot is a member of it. Public visibility is not enough — Slack rejects posts to a channel the bot has not joined. Either use an existing channel the bot is already in, or run `/invite @LUXEhub` in a scratch channel such as `#luxehub-test`.

Once she names the channel, the test can run.

## Test steps

1. Record the portal's current state so it can be restored exactly (`slack_channel_id` is `NULL` today).
2. Temporarily set that portal's `slack_channel_id` to the chosen channel.
3. Send a clearly-labelled test message as the client on that portal (e.g. "LUXEhub relay test — please ignore").
4. Check three things independently, not just the app's success toast:
   - the Slack channel visibly shows the message, formatted as `client name: message`
   - the saved `portal_messages` row has a non-null `slack_ts`, which only gets set when Slack confirms the post
   - the function logs show Slack returned success rather than an error such as `not_in_channel` or `channel_not_found`
5. Report exactly what happened, including the raw error text if Slack rejected the post.

## Cleanup

- Delete the test `portal_messages` row and any notification row it generated.
- Reset the portal's `slack_channel_id` back to `NULL`.
- Kristen deletes the test message on the Slack side (the API cannot remove a message posted by a different token cleanly, so this is a manual click).
- Confirm afterwards that all three portals are back to `slack_channel_id = NULL`.

## Notes

- No code changes are needed for this test. Everything required is already deployed: the send function, the Slack posting logic, and the bot token. The only missing piece was a channel ID on a portal.
- If Slack rejects the post, the message still saves to the portal and no error is shown to the client — so a failed test is invisible in the UI. That is why the checks above look at `slack_ts` and the logs rather than the screen.
- Whether that silent failure should stay silent, or surface a warning to agents, is a separate decision to make after we see the test result.

## Technical detail

- Portal id: `47f2a2b1-95a4-42df-b846-7e987fd7247d`.
- Path exercised: `PortalChatPanel` calls the `portal-send-message` function, which posts to Slack's `chat.postMessage` before inserting into `portal_messages`, storing the returned Slack timestamp as `slack_ts`.
- The channel can be set through the portal dialog's Slack channel picker, or directly on the record; either way clearing it back to null is a complete undo, since nothing else persists the channel.
