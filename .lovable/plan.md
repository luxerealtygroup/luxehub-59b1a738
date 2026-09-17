# In-app account deletion (Apple 5.1.1(v))

Let every signed-in person start deleting their own account from inside the app, with the exact effect depending on whether they are a client, an agent, or the hub owner.

## Where people find it

**Realtor side — Account Settings (`/dashboard/settings`)**
A new "Danger Zone" card, last on the page, separated by a thin red border with a red heading:

- Heading: Delete my account
- Text: "This permanently deletes your LUXEhub account and signs you out on every device. This cannot be undone."
- A red "Delete my account" button.

**Client side — new Settings screen in the portal**
The portal has no settings screen today, so a "Settings" item is added to the client menu (next to Sign Out). It shows their name and email, and the same Danger Zone card.

## The confirmation step

Clicking the button opens an in-app dialog (never the browser's own pop-up, so it works in the iPhone app):

- Title: "Delete your account?"
- Body: a plain list of what is removed and what is kept, written from the person's actual role.
- A box they must type into before the red "Permanently delete" button turns on.
- "Cancel" and "Permanently delete".

## What each role gets told and what happens

**Client** — type `DELETE`.
"Your sign-in is removed. The transaction records your agent keeps for their own files are not affected."
Their login and profile are deleted; their portal, documents and photos stay with the agent and the portal reverts to "no client login".

**Agent (not the hub owner)** — type `DELETE`.
Their login and profile are deleted; their clients, portals, open houses and transactions move to the hub owner so nothing is orphaned or lost. The dialog names the owner who will receive them.

**Hub owner** — type the hub's business name.
"This deletes your hub and every account in it, including your agents' accounts and your clients' portals."
The whole hub and every record and login belonging to it are deleted.

## Safety rules

- Nothing partial: if any step fails, nothing is deleted and the person sees a clear error with `info@luxerealtygroup.ca` to contact.
- The login itself is always removed last, after the records work succeeds.
- A record of every deletion (who, their role, when, what moved to whom) is written before anything is removed, so it survives the deletion.
- On success: signed out everywhere and sent to the sign-in screen with "Your account has been deleted."

## Support page

`/support` gains an FAQ entry "How do I delete my account?" describing Settings > Delete my account, with the support email as a fallback. The existing "How do I delete my account or my data?" entry is replaced by it.

## Technical notes

- New table `account_deletion_log` (actor id, email, role, org id, org name, action taken, reassignment summary, timestamp), insert-only from the server, readable by owners/admins of the same org and super admins, with GRANTs.
- New edge function `delete-my-account`:
  - Resolves the caller strictly from the JWT via the existing `_shared/auth.ts` pattern; the role is re-derived server-side from `user_roles` / `client_accounts` and never read from the request body.
  - Confirmation string is re-validated server-side (`DELETE`, or exact org name for owners).
  - Client path: null out `client_accounts.user_id` for that user, revoke outstanding portal invites, delete `profiles` row if present, then `auth.admin.deleteUser`.
  - Agent path: resolve the org's strict owner; reassign owning columns (`pipeline_clients`, `client_accounts.agent_id`, `portal_*` owner refs, `deals`, `commissions`, `open_houses`, `submissions`, `cma_reports`, `agent_*` ownership) to the owner id; delete role rows and profile; then delete the auth user.
  - Owner path: enumerate the org's tables by `org_id` and delete in FK-safe order, delete the `organizations` row, then delete every auth user whose profile or client account belonged to that org, owner last.
  - Each path runs its data work first and the auth deletion last; any error aborts before auth deletion and returns a plain error message.
- New shared UI `src/components/account/DeleteAccountCard.tsx` (card + dialog + typed confirmation + function call + `supabase.auth.signOut({ scope: 'global' })` + navigate to `/login` or `/client-portal/login`).
- `AccountSettings.tsx` renders it last; new `src/pages/client-portal/ClientSettings.tsx` (or a settings tab in `ClientDashboard`) renders it for clients, reachable from `ClientSidebar`.
- `Support.tsx` FAQ array updated.
