# Operations: fix another agent's client, and link a client to a Follow Up Boss deal

## What the audit found

**The role already exists — Operations.** Marie Zinger holds it (Luxe team only). It already
derives owner/admin rights inside her own team, and the database already lets her edit any
client, pipeline row or transaction in that team. Nothing in the rules is blocking her.

**So the block is the screens, not the permissions.** The Pipeline page only ever loads the
signed-in person's own clients. There is an admin "View as Agent" switch, but it is a
read-through lens, not a "fix this client" workflow, and it changes the whole app at once.

**Transactions is a mirror of Follow Up Boss.** The Transactions page lists deals straight out
of Follow Up Boss; LUXEhub only stores extras on top (splits, attribution). So "no transaction
record" for today's couple really means "no Follow Up Boss deal is connected to them". There is
no LUXEhub-side transaction to create for a client without a portal — connecting the Follow Up
Boss deal is the fix, which is exactly capability 2. For clients who do have a portal, portal
transactions already exist and Marie can already edit those.

**What Follow Up Boss already gives us:**
- A per-team Follow Up Boss key, stored securely, never shared across teams.
- Contact search already built and reusable: `FUBClientSearch` (used on the Pipeline page) and
  a search function behind it — Marie types, sees candidates, picks one. Exactly the
  "show candidates, let a human choose" behaviour asked for.
- Deals are in active use, not just People: the integration already reads a person's deals,
  and portal deal links are already stored (9 rows today).
- An existing confirm-before-import dialog for a Follow Up Boss deal, which prefills an address
  and refuses to save until a human accepts it.

So: reuse the contact picker, the deals reader and the import-confirm pattern. Build nothing new
for talking to Follow Up Boss.

## Plan

### 1. Operations can correct another agent's client

- Add an "All agents" scope to the Pipeline page, visible only to admins/owners/Operations.
  It loads the whole team's clients with the agent's name on each row; everyone else sees
  exactly what they see today.
- On another agent's client, Operations can change the stage and open the Follow Up Boss link
  (below). Everything else stays as it is.
- The assigned agent field stays locked — it is not editable from this view for anyone, so
  commission attribution cannot move. The September credit-to-the-wrong-person bug stays closed.
- Portal transactions: already editable by Operations; no change needed.

### 2. An audit trail the agent can see

- New insert-only log table recording: who made the change, which client, which agent owns it,
  what field, the old value, the new value, and when. Readable by owners, admins and Operations,
  and by the agent whose client it is. No updates, no deletes.
- The change is written whenever someone edits a client that is not their own.
- On the Pipeline page the agent sees a small "Changed by Marie Zinger — moved to Pending,
  2 Oct" note on the affected client, and the full list on the client's detail view.

### 3. Connect a client to a Follow Up Boss deal

- On any pipeline client, a "Link Follow Up Boss deal" action: Marie searches by name, email or
  phone using the existing picker, sees the matching people, picks the right one, then picks
  which of that person's deals to link. Two people sharing one email both appear — she chooses.
- Nothing links itself. No matching by name, no matching by email.
- Once linked, the client shows the deal name, pipeline/stage, price and projected closing,
  pulled from Follow Up Boss, with the date last refreshed, plus Refresh and Unlink buttons.
- One-way only. LUXEhub never writes back to Follow Up Boss.

## Technical notes

- Database changes are additive only: one new audit table, plus nullable link columns
  (`fub_deal_id`, deal snapshot fields) on `pipeline_clients`. Nothing dropped or renamed.
- Access rules reuse `is_admin_or_owner`, which already includes Operations, and stay scoped to
  the caller's team.
- Deal reads go through the existing Follow Up Boss functions and the team's own key.
- Not touching the account deletion flow or /support. Not publishing.
