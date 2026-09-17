# Portals independent of the pipeline

## What I found first (the audit you asked for)

I checked every place a portal could be tied to the pipeline: the Client Portals page, the portal detail screens, the client's own portal, and the access rules in the database.

**Good news: the access rules are already clean.** Who can open a portal is decided only by the portal's own relationships — the client on it, the agent it was assigned to, and admins/owners of that team. Nothing in the rules mentions the pipeline, and nothing mentions a deal being open or closed. The same is true for documents, photos, messages, transactions and contacts: they all hang off the portal.

**The one real coupling is the "Needs a portal" queue**, which reads the pipeline list (signed clients onward) to suggest who still needs a portal. That is the intended behaviour and stays as is.

**So why do clients disappear?** Two reasons, both in what the page *shows*, not in what people are *allowed* to see:

1. The Client Portals page has no status at all on a row and no way to narrow by it, so a past client is just another name in a long list — findable only by typing the exact name.
2. Agents work out of the Pipeline page, and a client who has closed is usually deleted from the pipeline by hand. Deleting the pipeline row does not touch the portal, but it removes the only place the agent was looking, so the portal feels gone.

There is also one genuine gap worth fixing while I am here: an agent can see a portal only if they are recorded as the person who set it up. If a portal is later handed to a different agent, that agent sees nothing.

## What I will change

### 1. Portal access truly by relationship
- Add a proper "assigned agent" field to each portal, defaulting to whoever set it up, and allow access for that agent as well. Additive only — nothing dropped or renamed.
- Leave all other portal rules untouched; they already survive a closed deal. No read-only or archived mode anywhere.

### 2. Pending clients leave the active pipeline automatically
- The pipeline already has a Pending stage (stage 9). The active Pipeline list will simply stop showing Pending clients, reactively — the moment the stage is set to Pending they drop out, and if the deal falls back to an earlier stage they reappear. Nothing is deleted.
- A small "Pending — moved to Transactions" note plus a toggle to show them anyway, so nobody thinks the record vanished.
- Pipeline counts and forecasting keep reading the same rows as today; only the on-screen list changes.

### 3. Past clients findable on Client Portals
- Each row gets a status: **Active**, **Pending** or **Closed**, worked out from the portal's own transactions (conditional/pending, closed, otherwise active).
- A status filter next to the existing filters, defaulting to **All**, so everything is visible by default.
- The page already loads every portal in the team; that stays, and the "Needs a portal" queue is unchanged.

## Technical notes
- Migration is additive: `client_accounts.assigned_agent_id` (nullable, backfilled from `invited_by`) plus an added SELECT policy branch; existing policies are left in place.
- Portal status derives from `portal_transactions.status` (`active`, `conditional`, `closed`) already fetched on the page — no extra round trip beyond the existing transactions query.
- Pipeline filtering is client-side on `stage === 9`, so it reacts immediately to an edit with no background job.
- Account deletion and /support are not touched. Nothing is published.
